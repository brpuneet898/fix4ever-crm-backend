import { FastifyInstance } from "fastify";
import { requireAdmin } from "../../shared/middleware/requireAdmin.middleware";
import { requirePermission } from "../../shared/middleware/permission.middleware";
import { PERMISSIONS } from "../../access";
import {
  listUsersController,
  getUserController,
  blockUserController,
  activateUserController,
  assignRolesController,
  removeRoleController,
  clearRolesController,
  getUserRolesController,
  setPermissionOverridesController,
  setUserRegionController,
  getUserAccessController,
  getPermissionCatalogController,
} from "../controllers/adminUserManagement.controller";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const r = (fn: unknown) => fn as any;

export async function adminUserManagementRoutes(app: FastifyInstance) {
  // All routes require admin authentication
  app.addHook("preHandler", requireAdmin);

  app.get(
    "/",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_USERS_VIEW)] },
    r(listUsersController),
  );
  app.get(
    "/:userId",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_USERS_VIEW)] },
    r(getUserController),
  );
  app.get(
    "/:userId/access",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_USERS_VIEW)] },
    r(getUserAccessController),
  );
  // Permission metadata for role/CRUD assignment UIs.
  app.get(
    "/permissions/catalog",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_USERS_VIEW)] },
    r(getPermissionCatalogController),
  );

  // Legacy frontend compatibility: allow reading admin roles directly.
  app.get(
    "/:userId/roles",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_ROLES_ASSIGN)] },
    r(getUserRolesController),
  );
  app.patch(
    "/:userId/block",
    { preHandler: [requirePermission(PERMISSIONS.CUSTOMERS_BLOCK)] },
    r(blockUserController),
  );
  app.patch(
    "/:userId/activate",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_USERS_UPDATE)] },
    r(activateUserController),
  );
  app.patch(
    "/:userId/roles",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_ROLES_ASSIGN)] },
    r(assignRolesController),
  );
  // Legacy frontend compatibility: PATCH /remove-role (instead of /roles/remove)
  app.patch(
    "/:userId/remove-role",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_ROLES_ASSIGN)] },
    r(removeRoleController),
  );
  app.patch(
    "/:userId/roles/remove",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_ROLES_ASSIGN)] },
    r(removeRoleController),
  );
  app.patch(
    "/:userId/roles/clear",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_ROLES_ASSIGN)] },
    r(clearRolesController),
  );

  // Legacy frontend compatibility: DELETE /roles to clear all roles.
  app.delete(
    "/:userId/roles",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_ROLES_ASSIGN)] },
    r(clearRolesController),
  );
  app.patch(
    "/:userId/permissions",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_PERMISSIONS_OVERRIDE)] },
    r(setPermissionOverridesController),
  );
  app.patch(
    "/:userId/region",
    { preHandler: [requirePermission(PERMISSIONS.ADMIN_USERS_UPDATE)] },
    r(setUserRegionController),
  );
}
