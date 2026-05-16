/**
 * Admin Subscription Management Service
 * PDF ref: Admin Section 7 — Subscription & Membership Management
 */
import { SubscriptionPlan } from "../../models/subscription/subscriptionPlan.model";
import { UserSubscription } from "../../models/subscription/userSubscription.model";
import { ApiError } from "../../errors/ApiError";

export async function listSubscriptionPlans() {
  return SubscriptionPlan.find({}).sort({ createdAt: -1 }).lean();
}

export async function createSubscriptionPlan(data: {
  name: string;
  slug: string;
  description: string;
  price: number;
  billingCycle: string;
  trialDays?: number;
  benefits?: string[];
  features?: Record<string, unknown>;
  createdBy: string;
}) {
  const existing = await SubscriptionPlan.findOne({ slug: data.slug });
  if (existing) throw ApiError.conflict("A plan with this slug already exists");
  return SubscriptionPlan.create(data);
}

export async function updateSubscriptionPlan(
  planId: string,
  updates: Record<string, unknown>,
) {
  const plan = await SubscriptionPlan.findByIdAndUpdate(
    planId,
    { $set: updates },
    { new: true },
  );
  if (!plan) throw ApiError.notFound("Subscription plan not found");
  return plan;
}

export async function deleteSubscriptionPlan(planId: string) {
  const active = await UserSubscription.countDocuments({
    planId,
    status: "active",
  });
  if (active > 0)
    throw ApiError.badRequest(`Cannot delete: ${active} active subscribers`);
  await SubscriptionPlan.findByIdAndDelete(planId);
}

export async function getSubscriptionAnalytics() {
  const [byStatus, byPlan, churnRate] = await Promise.all([
    UserSubscription.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    UserSubscription.aggregate([
      {
        $group: {
          _id: "$planId",
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
        },
      },
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "_id",
          foreignField: "_id",
          as: "plan",
        },
      },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
    ]),
    UserSubscription.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const churn = churnRate[0]
    ? ((churnRate[0].cancelled / churnRate[0].total) * 100).toFixed(2)
    : 0;

  return { byStatus, byPlan, churnRate: `${churn}%` };
}

export async function listUserSubscriptions(
  status?: string,
  planId?: string,
  page = 1,
  limit = 20,
) {
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (planId) query.planId = planId;

  const [subs, total] = await Promise.all([
    UserSubscription.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "username email")
      .populate("planId", "name price billingCycle")
      .lean(),
    UserSubscription.countDocuments(query),
  ]);

  return { subs, total };
}
