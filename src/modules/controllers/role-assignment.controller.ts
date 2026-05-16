import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  listUsersService,
  assignRolesService,
  removeRoleService,
  clearRolesService,
  getUserRolesService,
} from "../../shared/services/legacy/role-assignment.service";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";

const assignRolesSchema = z.object({
  roles: z
    .array(z.enum(["crm_manager", "editor", "regional_manager"]))
    .min(1, "Provide at least one role"),
});

const removeRoleSchema = z.object({
  role: z.enum(["crm_manager", "editor", "regional_manager"]),
});

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

type UserParams = { Params: { userId: string } };

export async function listUsersController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { page, limit } = paginationSchema.parse(request.query);
  const { users, total } = await listUsersService(page, limit);
  return reply.send(
    paginatedResponse(users, total, page, limit, "Users fetched successfully"),
  );
}

export async function assignRolesController(
  request: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const adminId = request.admin!.userId;
  const { userId } = request.params;
  const { roles } = assignRolesSchema.parse(request.body);

  const result = await assignRolesService(adminId, userId, roles);
  return reply.send(successResponse(result, "Roles assigned successfully"));
}

export async function removeRoleController(
  request: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const adminId = request.admin!.userId;
  const { userId } = request.params;
  const { role } = removeRoleSchema.parse(request.body);

  const result = await removeRoleService(adminId, userId, role);
  return reply.send(successResponse(result, "Role removed successfully"));
}

export async function clearRolesController(
  request: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const adminId = request.admin!.userId;
  const { userId } = request.params;

  const result = await clearRolesService(adminId, userId);
  return reply.send(successResponse(result, "All roles cleared successfully"));
}

export async function getUserRolesController(
  request: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const { userId } = request.params;
  const result = await getUserRolesService(userId);
  return reply.send(successResponse(result, "User roles fetched successfully"));
}
