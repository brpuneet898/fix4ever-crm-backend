/**
 * Invitation Service
 *
 * Business logic for the invitation lifecycle: create, list, cancel, resend,
 * and accept. Handles validation, deduplication, and user creation/update.
 */
import { invitationRepository } from "../repositories/invitation.repository";
import { userRepository } from "../repositories/user.repository";
import { validateAssignableRoles } from "../utils/role-validation.util";
import { ApiError } from "../errors/ApiError";
import { logger } from "../logger/logger";
import { env } from "../../config/env.config";
import { hashPassword } from "../utils/password.util";
import { signAccessToken, signRefreshToken } from "../utils/jwt.util";
import { buildEffectivePermissions } from "../../access";
import type { AssignableRole } from "../models/user.model";
import type { InvitationStatus } from "../models/invitation.model";

/** Base URL for invite links (no trailing slash) */
const BASE_URL = env.FRONTEND_URL!.replace(/\/$/, "");

/**
 * Creates a new invitation and returns the shareable invite link.
 * Rejects if user already exists with admin/vendor/captain role, or if a pending invite exists.
 */
export async function createInvitationService(
  adminId: string,
  adminName: string | undefined,
  email: string,
  roles: unknown,
): Promise<{
  id: string;
  email: string;
  roles: AssignableRole[];
  status: string;
  expiresAt: Date;
  inviteLink: string;
  message: string;
}> {
  const validatedRoles = validateAssignableRoles(roles);
  const emailLower = email.toLowerCase().trim();

  const existingUser = await userRepository.findByEmail(emailLower);
  if (existingUser) {
    if (
      existingUser.role === "admin" ||
      existingUser.role === "vendor" ||
      existingUser.role === "captain"
    ) {
      throw ApiError.badRequest(
        `Cannot invite ${emailLower}. User exists with base role "${existingUser.role}". Use role assignment instead.`,
      );
    }
  }

  const pendingInvite =
    await invitationRepository.findPendingByEmail(emailLower);
  if (pendingInvite) {
    throw ApiError.conflict(
      `An invitation for ${emailLower} is already pending. Cancel it first or wait for it to expire.`,
    );
  }

  const invitation = await invitationRepository.create(
    emailLower,
    validatedRoles,
    adminId,
    adminName,
  );
  const inviteLink = `${BASE_URL}/invite/accept/${invitation.token}`;

  logger.info(
    {
      action: "INVITATION_CREATED",
      performedBy: adminId,
      email: emailLower,
      roles: validatedRoles,
      invitationId: String(invitation._id),
    },
    "Admin created invitation",
  );

  return {
    id: String(invitation._id),
    email: invitation.email,
    roles: invitation.roles,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    inviteLink,
    message: "Invitation created. Share the link with the invitee.",
  };
}

/**
 * Public endpoint: returns invite details by token (no auth required).
 * Used when user opens invite link to see what they're accepting.
 */
export async function getInvitationByTokenService(token: string) {
  const invitation = await invitationRepository.findByToken(token);
  if (!invitation) throw ApiError.notFound("Invitation not found");
  if (invitation.status !== "pending") {
    throw ApiError.badRequest(
      `This invitation has already been ${invitation.status}.`,
    );
  }
  if (new Date() > invitation.expiresAt) {
    throw ApiError.badRequest("This invitation has expired.");
  }

  const inviter = invitation.invitedBy as {
    email?: string;
    username?: string;
  } | null;
  return {
    email: invitation.email,
    roles: invitation.roles,
    invitedByName:
      invitation.invitedByName ??
      inviter?.username ??
      inviter?.email ??
      "Administrator",
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Accepts an invitation: creates new user or updates existing user's roles,
 * marks invitation accepted, and returns auth tokens for immediate login.
 */
export async function acceptInvitationService(
  token: string,
  password: string,
  username: string,
) {
  const invitation = await invitationRepository.findByToken(token);
  if (!invitation) throw ApiError.notFound("Invitation not found");
  if (invitation.status !== "pending") {
    throw ApiError.badRequest(
      `This invitation has already been ${invitation.status}.`,
    );
  }
  if (new Date() > invitation.expiresAt) {
    throw ApiError.badRequest("This invitation has expired.");
  }

  let user = await userRepository.findByEmail(invitation.email);

  if (user) {
    if (
      user.role === "admin" ||
      user.role === "vendor" ||
      user.role === "captain"
    ) {
      throw ApiError.forbidden(
        "You already have an account. Contact your administrator for role changes.",
      );
    }
    const combinedRoles = [
      ...new Set([...user.roles, ...invitation.roles]),
    ] as AssignableRole[];
    await userRepository.updateRoles(String(user._id), combinedRoles);
    user = (await userRepository.findById(String(user._id)))!;
  } else {
    const hashedPassword = await hashPassword(password);
    user = await userRepository.create({
      email: invitation.email,
      username: username.trim() || invitation.email.split("@")[0],
      password: hashedPassword,
      role: "user",
      roles: invitation.roles,
      isVendor: false,
      isActive: true,
    });
  }

  await invitationRepository.updateStatus(
    String(invitation._id),
    "accepted",
    String(user._id),
  );

  const permissions = buildEffectivePermissions({
    role: user.role,
    permissionOverrides: user.permissionOverrides as
      | { granted?: string[]; denied?: string[] }
      | undefined,
  });

  const accessToken = signAccessToken({
    userId: String(user._id),
    email: user.email,
    role: user.role,
    roles: user.roles ?? [],
    permissions,
    region: (user as unknown as { region?: string }).region,
  });
  const refreshToken = signRefreshToken(String(user._id));

  logger.info(
    {
      action: "INVITATION_ACCEPTED",
      email: invitation.email,
      invitationId: String(invitation._id),
    },
    "User accepted invitation",
  );

  return {
    user: {
      id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role,
      roles: user.roles,
      avatar: user.avatar,
      isActive: user.isActive,
    },
    tokens: { accessToken, refreshToken },
  };
}

/** Paginated list of invitations for admin dashboard. */
export async function listInvitationsService(
  page: number,
  limit: number,
  status?: InvitationStatus,
) {
  const { invitations, total } = await invitationRepository.findAll(
    page,
    limit,
    status,
  );
  return {
    invitations: invitations.map((inv) => ({
      id: String(inv._id),
      email: inv.email,
      roles: inv.roles,
      status: inv.status,
      invitedByName: inv.invitedByName,
      invitedBy: (inv.invitedBy as { email?: string; username?: string })
        ?.email,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      createdAt: inv.createdAt,
    })),
    total,
  };
}

export async function cancelInvitationService(
  adminId: string,
  invitationId: string,
) {
  const invitation = await invitationRepository.findById(invitationId);
  if (!invitation) throw ApiError.notFound("Invitation not found");
  if (invitation.status !== "pending") {
    throw ApiError.badRequest(
      `Cannot cancel invitation with status "${invitation.status}".`,
    );
  }

  await invitationRepository.cancel(invitationId);

  logger.info(
    { action: "INVITATION_CANCELLED", performedBy: adminId, invitationId },
    "Admin cancelled invitation",
  );

  return { message: "Invitation cancelled", status: "cancelled" };
}

/**
 * Generates a new invite link for a pending invitation. Invalidates the old link.
 * Extends expiry by another 7 days.
 */
export async function resendInvitationService(
  adminId: string,
  invitationId: string,
) {
  const invitation = await invitationRepository.findById(invitationId);
  if (!invitation) throw ApiError.notFound("Invitation not found");
  if (invitation.status !== "pending") {
    throw ApiError.badRequest(
      `Cannot resend invitation with status "${invitation.status}".`,
    );
  }
  if (new Date() > invitation.expiresAt) {
    throw ApiError.badRequest(
      "Invitation has expired. Create a new one instead.",
    );
  }

  const updated = await invitationRepository.resend(invitationId);
  if (!updated) throw ApiError.internal("Failed to resend invitation");

  const inviteLink = `${BASE_URL}/invite/accept/${updated.token}`;

  logger.info(
    { action: "INVITATION_RESENT", performedBy: adminId, invitationId },
    "Admin resent invitation",
  );

  return {
    inviteLink,
    expiresAt: updated.expiresAt,
    message: "New invite link generated. Previous link is no longer valid.",
  };
}
