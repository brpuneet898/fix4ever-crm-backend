/**
 * Admin Captain Management Service
 *
 * Queries the shared MongoDB collections used by the MainApp backend.
 * Collection names: captains, captainwallets, captainwallettransactions,
 *                   captainsettlementrequests, servicerequests
 */
import mongoose from "mongoose";
import { ApiError } from "../../errors/ApiError";

function Captain() {
  return mongoose.model("Captain");
}
function CaptainWallet() {
  return mongoose.model("CaptainWallet");
}
function CaptainWalletTx() {
  return mongoose.model("CaptainWalletTransaction");
}
function CaptainSettlement() {
  return mongoose.model("CaptainSettlementRequest");
}
function SR() {
  return mongoose.model("ServiceRequest");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CaptainFilter {
  onboardingStatus?: string;
  availability?: string;
  search?: string;
  serviceArea?: string;
  page?: number;
  limit?: number;
}

export interface CaptainTxFilter {
  type?: string;
  category?: string;
  status?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export interface CaptainHistoryFilter {
  from?: Date;
  to?: Date;
  serviceType?: string;
  page?: number;
  limit?: number;
}

export interface SettlementFilter {
  status?: string;
  captainId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

// ─── List & Stats ─────────────────────────────────────────────────────────────

export async function listCaptains(filter: CaptainFilter) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};

  if (filter.onboardingStatus) query.onboardingStatus = filter.onboardingStatus;
  if (filter.availability) query.availability = filter.availability;
  if (filter.serviceArea) {
    query["servicePreferences.serviceAreas"] = { $in: [filter.serviceArea] };
  }
  if (filter.search) {
    query.$or = [
      { "personalInfo.fullName": { $regex: filter.search, $options: "i" } },
      { "personalInfo.email": { $regex: filter.search, $options: "i" } },
      { "personalInfo.phone": { $regex: filter.search, $options: "i" } },
    ];
  }

  const [captains, total] = await Promise.all([
    Captain()
      .find(query)
      .select(
        "personalInfo vehicleDetails onboardingStatus availability averageRating totalReviews createdAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Captain().countDocuments(query),
  ]);

  return { captains, total, page, limit };
}

export async function getCaptainStats() {
  const [total, pending, approved, rejected, suspended, available, onTrip] =
    await Promise.all([
      Captain().countDocuments(),
      Captain().countDocuments({ onboardingStatus: "In Review" }),
      Captain().countDocuments({ onboardingStatus: "Approved" }),
      Captain().countDocuments({ onboardingStatus: "Rejected" }),
      Captain().countDocuments({
        onboardingStatus: "Approved",
        "reviewComments": { $regex: /^SUSPENDED:/, $options: "i" },
      }),
      Captain().countDocuments({ availability: "Available" }),
      Captain().countDocuments({ availability: "On Trip" }),
    ]);

  return { total, pending, approved, rejected, suspended, available, onTrip };
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getCaptainDetail(captainId: string) {
  if (!mongoose.Types.ObjectId.isValid(captainId))
    throw ApiError.badRequest("Invalid captain ID");

  const [captain, wallet] = await Promise.all([
    Captain().findById(captainId).lean(),
    CaptainWallet().findOne({ captainId }).lean(),
  ]);

  if (!captain) throw ApiError.notFound("Captain not found");

  return { captain, wallet };
}

export async function updateCaptainInfo(
  captainId: string,
  patch: Record<string, unknown>,
) {
  if (!mongoose.Types.ObjectId.isValid(captainId))
    throw ApiError.badRequest("Invalid captain ID");

  const allowed = [
    "personalInfo.fullName",
    "personalInfo.phone",
    "personalInfo.alternatePhone",
    "personalInfo.residentialAddress",
    "servicePreferences.workingHours",
    "servicePreferences.workingDays",
    "servicePreferences.serviceAreas",
    "servicePreferences.maxTravelDistance",
  ];

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }

  const captain = await Captain().findByIdAndUpdate(
    captainId,
    { $set: update },
    { new: true },
  );
  if (!captain) throw ApiError.notFound("Captain not found");
  return captain;
}

export async function updateCaptainDocuments(
  captainId: string,
  patch: Record<string, unknown>,
) {
  if (!mongoose.Types.ObjectId.isValid(captainId))
    throw ApiError.badRequest("Invalid captain ID");

  const allowed = [
    "vehicleDetails.registrationCertificate",
    "vehicleDetails.insuranceDocument",
    "vehicleDetails.vehiclePhotos",
    "drivingLicenseDetails.licensePhoto",
    "drivingLicenseDetails.licenseNumber",
    "drivingLicenseDetails.expiryDate",
    "identityVerification.governmentIdProof",
    "identityVerification.selfieVerification",
    "identityVerification.verificationStatus",
    "bankDetails.cancelledCheque",
  ];

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }

  const captain = await Captain().findByIdAndUpdate(
    captainId,
    { $set: update },
    { new: true },
  );
  if (!captain) throw ApiError.notFound("Captain not found");
  return captain;
}

// ─── Onboarding Actions ───────────────────────────────────────────────────────

export async function approveCaptain(
  adminId: string,
  captainId: string,
  notes?: string,
) {
  const captain = await Captain().findByIdAndUpdate(
    captainId,
    {
      $set: {
        onboardingStatus: "Approved",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewComments: notes ?? "Approved by admin",
        "identityVerification.verificationStatus": "Verified",
      },
    },
    { new: true },
  );
  if (!captain) throw ApiError.notFound("Captain not found");
  return captain;
}

export async function rejectCaptain(
  adminId: string,
  captainId: string,
  reason: string,
) {
  const captain = await Captain().findByIdAndUpdate(
    captainId,
    {
      $set: {
        onboardingStatus: "Rejected",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewComments: reason,
        "identityVerification.verificationStatus": "Rejected",
      },
    },
    { new: true },
  );
  if (!captain) throw ApiError.notFound("Captain not found");
  return captain;
}

export async function suspendCaptain(
  adminId: string,
  captainId: string,
  reason: string,
) {
  const captain = await Captain().findByIdAndUpdate(
    captainId,
    {
      $set: {
        availability: "Offline",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewComments: `SUSPENDED: ${reason}`,
      },
    },
    { new: true },
  );
  if (!captain) throw ApiError.notFound("Captain not found");
  return captain;
}

export async function reactivateCaptain(adminId: string, captainId: string) {
  const captain = await Captain().findByIdAndUpdate(
    captainId,
    {
      $set: {
        availability: "Offline",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewComments: "Reactivated by admin",
      },
    },
    { new: true },
  );
  if (!captain) throw ApiError.notFound("Captain not found");
  return captain;
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export async function getCaptainWallet(captainId: string) {
  if (!mongoose.Types.ObjectId.isValid(captainId))
    throw ApiError.badRequest("Invalid captain ID");

  const wallet = await CaptainWallet().findOne({ captainId }).lean();
  if (!wallet) throw ApiError.notFound("Wallet not found");

  const availableBalance =
    (wallet as Record<string, number>).balance -
    (wallet as Record<string, number>).pendingSettlement;

  return { ...wallet, availableBalance };
}

export async function getCaptainTransactions(
  captainId: string,
  filter: CaptainTxFilter,
) {
  if (!mongoose.Types.ObjectId.isValid(captainId))
    throw ApiError.badRequest("Invalid captain ID");

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {
    captainId: new mongoose.Types.ObjectId(captainId),
  };
  if (filter.type) query.type = filter.type;
  if (filter.category) query.category = filter.category;
  if (filter.status) query.status = filter.status;
  if (filter.from || filter.to) {
    query.createdAt = {};
    if (filter.from)
      (query.createdAt as Record<string, unknown>).$gte = filter.from;
    if (filter.to)
      (query.createdAt as Record<string, unknown>).$lte = filter.to;
  }

  const [transactions, total] = await Promise.all([
    CaptainWalletTx()
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CaptainWalletTx().countDocuments(query),
  ]);

  return { transactions, total, page, limit };
}

export async function getCaptainWalletAnalytics(captainId: string) {
  if (!mongoose.Types.ObjectId.isValid(captainId))
    throw ApiError.badRequest("Invalid captain ID");

  const cid = new mongoose.Types.ObjectId(captainId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [thisMonth, thisYear, byTripType, recentTx] = await Promise.all([
    CaptainWalletTx().aggregate([
      {
        $match: {
          captainId: cid,
          type: "credit",
          status: "completed",
          createdAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    CaptainWalletTx().aggregate([
      {
        $match: {
          captainId: cid,
          type: "credit",
          status: "completed",
          createdAt: { $gte: startOfYear },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    CaptainWalletTx().aggregate([
      {
        $match: { captainId: cid, type: "credit", status: "completed" },
      },
      {
        $group: {
          _id: "$metadata.tripType",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    CaptainWalletTx()
      .find({ captainId: cid })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  return {
    thisMonth: { total: thisMonth[0]?.total ?? 0, trips: thisMonth[0]?.count ?? 0 },
    thisYear: { total: thisYear[0]?.total ?? 0, trips: thisYear[0]?.count ?? 0 },
    byTripType: Object.fromEntries(
      byTripType.map((r: Record<string, unknown>) => [
        r._id ?? "unknown",
        { total: r.total, count: r.count },
      ]),
    ),
    recentTransactions: recentTx,
  };
}

// ─── Live Orders ──────────────────────────────────────────────────────────────

export async function getCaptainLiveOrders(captainId: string) {
  if (!mongoose.Types.ObjectId.isValid(captainId))
    throw ApiError.badRequest("Invalid captain ID");

  const cid = new mongoose.Types.ObjectId(captainId);

  const orders = await SR()
    .find({
      $or: [{ assignedCaptain: cid }, { "captainDropRequest.assignedCaptain": cid }],
      status: {
        $nin: ["Completed", "Cancelled", "Expired", "Device Delivered"],
      },
    })
    .select(
      "request_id serviceType status createdAt customer assignedVendor captainPickupRequest captainDropRequest",
    )
    .populate("customer", "name phone")
    .sort({ createdAt: -1 })
    .lean();

  return orders;
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getCaptainHistory(
  captainId: string,
  filter: CaptainHistoryFilter,
) {
  if (!mongoose.Types.ObjectId.isValid(captainId))
    throw ApiError.badRequest("Invalid captain ID");

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;
  const cid = new mongoose.Types.ObjectId(captainId);

  const txQuery: Record<string, unknown> = {
    captainId: cid,
    type: "credit",
    status: "completed",
    category: "trip_earning",
  };
  if (filter.from || filter.to) {
    txQuery.createdAt = {};
    if (filter.from)
      (txQuery.createdAt as Record<string, unknown>).$gte = filter.from;
    if (filter.to)
      (txQuery.createdAt as Record<string, unknown>).$lte = filter.to;
  }
  if (filter.serviceType) {
    txQuery["metadata.serviceType"] = filter.serviceType;
  }

  const [trips, total] = await Promise.all([
    CaptainWalletTx()
      .find(txQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CaptainWalletTx().countDocuments(txQuery),
  ]);

  return { trips, total, page, limit };
}

// ─── Settlements ──────────────────────────────────────────────────────────────

export async function listCaptainSettlements(filter: SettlementFilter) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  if (filter.captainId && mongoose.Types.ObjectId.isValid(filter.captainId)) {
    query.captainId = new mongoose.Types.ObjectId(filter.captainId);
  }
  if (filter.from || filter.to) {
    query.requestedAt = {};
    if (filter.from)
      (query.requestedAt as Record<string, unknown>).$gte = filter.from;
    if (filter.to)
      (query.requestedAt as Record<string, unknown>).$lte = filter.to;
  }

  const [settlements, total] = await Promise.all([
    CaptainSettlement()
      .find(query)
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CaptainSettlement().countDocuments(query),
  ]);

  return { settlements, total, page, limit };
}

export async function approveSettlement(adminId: string, settlementId: string) {
  if (!mongoose.Types.ObjectId.isValid(settlementId))
    throw ApiError.badRequest("Invalid settlement ID");

  const settlement = await CaptainSettlement().findByIdAndUpdate(
    settlementId,
    {
      $set: {
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!settlement) throw ApiError.notFound("Settlement not found");
  return settlement;
}

export async function rejectSettlement(
  adminId: string,
  settlementId: string,
  reason: string,
) {
  if (!mongoose.Types.ObjectId.isValid(settlementId))
    throw ApiError.badRequest("Invalid settlement ID");

  const settlement = await CaptainSettlement().findByIdAndUpdate(
    settlementId,
    {
      $set: {
        status: "rejected",
        rejectedBy: adminId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    },
    { new: true },
  );
  if (!settlement) throw ApiError.notFound("Settlement not found");
  return settlement;
}
