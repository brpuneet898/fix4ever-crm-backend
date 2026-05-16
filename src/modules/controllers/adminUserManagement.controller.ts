import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  listAllUsers,
  getUserById,
  blockUser,
  activateUser,
  assignRolesToUser,
  removeRoleFromUser,
  clearUserRoles,
  getUserRolesSummary,
  setPermissionOverrides,
  setUserRegion,
  getUserAccessSummary,
  getPermissionCatalog,
} from "../../shared/services/admin";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";
import { ASSIGNABLE_ROLES } from "../../shared/models/user.model";

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const userFilterSchema = z.object({
  role: z.string().optional(),
  roles: z.string().optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v ? v === "true" : undefined)),
  search: z.string().optional(),
  region: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const assignRolesSchema = z.object({
  roles: z.array(z.enum(ASSIGNABLE_ROLES as [string, ...string[]])).min(1),
});

const removeRoleSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
});

const permissionOverrideSchema = z.object({
  granted: z.array(z.string()).default([]),
  denied: z.array(z.string()).default([]),
});

const regionSchema = z.object({
  region: z.string().min(1),
});

type UserParams = { Params: { userId: string } };

export async function listUsersController(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const query = userFilterSchema.parse(req.query);
  const { page, limit, ...filter } = query;
  const result = await listAllUsers(filter, page, limit);
  return reply.send(
    paginatedResponse(result.users, result.total, page, limit, "Users fetched"),
  );
}

export async function getUserController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const user = await getUserById(req.params.userId);
  return reply.send(successResponse(user, "User fetched"));
}

export async function blockUserController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const adminId = req.admin!.userId;
  const user = await blockUser(adminId, req.params.userId);
  await audit(req, "BLOCK", "users", {
    targetId: req.params.userId,
    targetModel: "User",
    targetDescription: `Blocked user ${user.email}`,
  });
  return reply.send(successResponse(user, "User blocked"));
}

export async function activateUserController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const adminId = req.admin!.userId;
  const user = await activateUser(adminId, req.params.userId);
  await audit(req, "UPDATE", "users", {
    targetId: req.params.userId,
    targetModel: "User",
    targetDescription: `Activated user ${user.email}`,
  });
  return reply.send(successResponse(user, "User activated"));
}

export async function assignRolesController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const { roles } = assignRolesSchema.parse(req.body);
  const user = await assignRolesToUser(
    req.admin!.userId,
    req.params.userId,
    roles as import("../../shared/models/user.model").AssignableRole[],
  );
  await audit(req, "ROLE_ASSIGN", "users", {
    targetId: req.params.userId,
    targetModel: "User",
    metadata: { roles },
  });
  return reply.send(successResponse(user, "Roles assigned"));
}

export async function removeRoleController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const { role } = removeRoleSchema.parse(req.body);
  const user = await removeRoleFromUser(
    req.admin!.userId,
    req.params.userId,
    role as import("../../shared/models/user.model").AssignableRole,
  );
  await audit(req, "ROLE_REMOVE", "users", {
    targetId: req.params.userId,
    targetModel: "User",
    metadata: { removedRole: role },
  });
  return reply.send(successResponse(user, "Role removed"));
}

export async function clearRolesController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const user = await clearUserRoles(req.admin!.userId, req.params.userId);
  await audit(req, "ROLE_REMOVE", "users", {
    targetId: req.params.userId,
    targetModel: "User",
    targetDescription: "All roles cleared",
  });
  return reply.send(successResponse(user, "All roles cleared"));
}

export async function setPermissionOverridesController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const { granted, denied } = permissionOverrideSchema.parse(req.body);
  const user = await setPermissionOverrides(
    req.admin!.userId,
    req.params.userId,
    granted,
    denied,
    req.admin!.role, // pass actor role for privilege escalation guard
  );
  await audit(req, "PERMISSION_OVERRIDE", "users", {
    targetId: req.params.userId,
    targetModel: "User",
    metadata: { granted, denied },
  });
  return reply.send(successResponse(user, "Permission overrides set"));
}

export async function setUserRegionController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const { region } = regionSchema.parse(req.body);
  const user = await setUserRegion(
    req.admin!.userId,
    req.params.userId,
    region,
  );
  await audit(req, "UPDATE", "users", {
    targetId: req.params.userId,
    targetModel: "User",
    metadata: { region },
  });
  return reply.send(successResponse(user, "User region updated"));
}

export async function getUserAccessController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const access = await getUserAccessSummary(req.params.userId);
  return reply.send(successResponse(access, "User access fetched"));
}

export async function getUserRolesController(
  req: FastifyRequest<UserParams>,
  reply: FastifyReply,
) {
  const roles = await getUserRolesSummary(req.params.userId);
  return reply.send(successResponse(roles, "User roles fetched successfully"));
}

export async function getPermissionCatalogController(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  const data = getPermissionCatalog();
  return reply.send(successResponse(data, "Permission catalog fetched"));
}
