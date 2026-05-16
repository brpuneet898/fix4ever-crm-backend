/**
 * Invitation Controller
 *
 * HTTP handlers for invitation routes. Uses Zod for request validation.
 * Admin routes are protected by requireAdmin middleware; token/accept routes are public.
 */
import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  createInvitationService,
  listInvitationsService,
  cancelInvitationService,
  resendInvitationService,
  getInvitationByTokenService,
  acceptInvitationService,
} from "../../shared/services/invitation.service";
import { userRepository } from "../../shared/repositories/user.repository";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";

/** Validates create-invitation request body */
const createSchema = z.object({
  email: z.string().email("Invalid email address"),
  roles: z
    .array(z.enum(["crm_manager", "editor", "regional_manager"]))
    .min(1, "Select at least one role"),
});

/** Validates accept-invitation request body */
const acceptSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  username: z.string().min(2, "Name must be at least 2 characters").max(100),
});

/** Validates list-invitations query params */
const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(["pending", "accepted", "expired", "cancelled"]).optional(),
});

type TokenParams = { Params: { token: string } };
type IdParams = { Params: { id: string } };

export async function createInvitationController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const adminId = request.admin!.userId;
  const adminUser = await userRepository.findById(adminId);
  const adminName = adminUser?.username ?? request.admin!.email;
  const { email, roles } = createSchema.parse(request.body);
  const result = await createInvitationService(
    adminId,
    adminName,
    email,
    roles,
  );
  return reply.status(201).send(successResponse(result, result.message));
}

export async function listInvitationsController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { page, limit, status } = paginationSchema.parse(request.query);
  const { invitations, total } = await listInvitationsService(
    page,
    limit,
    status,
  );
  return reply.send(
    paginatedResponse(
      invitations,
      total,
      page,
      limit,
      "Invitations fetched successfully",
    ),
  );
}

export async function cancelInvitationController(
  request: FastifyRequest<IdParams>,
  reply: FastifyReply,
) {
  const adminId = request.admin!.userId;
  const { id } = request.params;
  const result = await cancelInvitationService(adminId, id);
  return reply.send(successResponse(result, result.message));
}

export async function resendInvitationController(
  request: FastifyRequest<IdParams>,
  reply: FastifyReply,
) {
  const adminId = request.admin!.userId;
  const { id } = request.params;
  const result = await resendInvitationService(adminId, id);
  return reply.send(successResponse(result, result.message));
}

export async function getInvitationByTokenController(
  request: FastifyRequest<TokenParams>,
  reply: FastifyReply,
) {
  const { token } = request.params;
  const result = await getInvitationByTokenService(token);
  return reply.send(successResponse(result, "Invitation details"));
}

export async function acceptInvitationController(
  request: FastifyRequest<TokenParams>,
  reply: FastifyReply,
) {
  const { token } = request.params;
  const { password, username } = acceptSchema.parse(request.body);
  const result = await acceptInvitationService(token, password, username);
  return reply.send(
    successResponse(
      result,
      "Account created successfully. You are now signed in.",
    ),
  );
}
