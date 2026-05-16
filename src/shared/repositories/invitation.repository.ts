/**
 * Invitation Repository
 *
 * Data access layer for invitations. All MongoDB operations for invitations
 * go through this module. Keeps business logic out of the database layer.
 */
import mongoose from "mongoose";
import {
  Invitation,
  IInvitationDocument,
  InvitationStatus,
  generateInviteToken,
  INVITATION_EXPIRY_DAYS,
} from "../models/invitation.model";
import type { AssignableRole } from "../models/user.model";

class InvitationRepository {
  /**
   * Creates a new invitation with a unique token and 7-day expiry.
   * Email is normalized to lowercase for consistent lookup.
   */
  async create(
    email: string,
    roles: AssignableRole[],
    invitedBy: string,
    invitedByName?: string,
  ): Promise<IInvitationDocument> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    return Invitation.create({
      email: email.toLowerCase(),
      roles,
      token: generateInviteToken(),
      status: "pending",
      invitedBy: new mongoose.Types.ObjectId(invitedBy),
      invitedByName,
      expiresAt,
    });
  }

  /** Finds an invitation by its unique token (used when user opens invite link). */
  async findByToken(token: string): Promise<IInvitationDocument | null> {
    return Invitation.findOne({ token }).populate(
      "invitedBy",
      "email username",
    );
  }

  /** Finds by MongoDB _id. Returns null if ID is invalid. */
  async findById(id: string): Promise<IInvitationDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Invitation.findById(id).populate("invitedBy", "email username");
  }

  /**
   * Checks if a valid (pending, not expired) invitation already exists for this email.
   * Prevents duplicate invitations to the same address.
   */
  async findPendingByEmail(email: string): Promise<IInvitationDocument | null> {
    return Invitation.findOne({
      email: email.toLowerCase(),
      status: "pending",
      expiresAt: { $gt: new Date() },
    });
  }

  /**
   * Paginated list of invitations. Optional status filter.
   * Uses Promise.all for parallel fetch (faster than two sequential queries).
   */
  async findAll(
    page: number,
    limit: number,
    status?: InvitationStatus,
  ): Promise<{ invitations: IInvitationDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const filter = status ? { status } : {};

    const [invitations, total] = await Promise.all([
      Invitation.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("invitedBy", "email username"),
      Invitation.countDocuments(filter),
    ]);

    return { invitations, total };
  }

  /** Updates invitation status. Sets acceptedAt/acceptedBy when status is "accepted". */
  async updateStatus(
    id: string,
    status: InvitationStatus,
    acceptedBy?: string,
  ): Promise<IInvitationDocument | null> {
    const update: Record<string, unknown> = { status };
    if (status === "accepted") {
      update.acceptedAt = new Date();
      if (acceptedBy)
        update.acceptedBy = new mongoose.Types.ObjectId(acceptedBy);
    }
    return Invitation.findByIdAndUpdate(id, update, { new: true });
  }

  /** Marks invitation as cancelled (admin action). */
  async cancel(id: string): Promise<IInvitationDocument | null> {
    return this.updateStatus(id, "cancelled");
  }

  /**
   * Generates a new token and extends expiry. Invalidates the previous link.
   * Only works for pending invitations.
   */
  async resend(id: string): Promise<IInvitationDocument | null> {
    const inv = await Invitation.findById(id);
    if (!inv || inv.status !== "pending") return null;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    return Invitation.findByIdAndUpdate(
      id,
      { token: generateInviteToken(), expiresAt, updatedAt: new Date() },
      { new: true },
    );
  }
}

export const invitationRepository = new InvitationRepository();
