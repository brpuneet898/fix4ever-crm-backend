import { FastifyInstance } from "fastify";
import {
  listUsersController,
  assignRolesController,
  removeRoleController,
  clearRolesController,
  getUserRolesController,
} from "../controllers/role-assignment.controller";
import { requireAdmin } from "../../shared/middleware/requireAdmin.middleware";

export async function adminRoutes(app: FastifyInstance) {
  // All routes in this plugin are admin-only
  app.addHook("preHandler", requireAdmin);

  // GET /admin/users — paginated user list
  app.get("/users", listUsersController);

  // GET /admin/users/:userId/roles — get roles for a specific user
  app.get("/users/:userId/roles", getUserRolesController);

  // PATCH /admin/users/:userId/roles — assign/replace roles for a user
  app.patch("/users/:userId/roles", assignRolesController);

  // PATCH /admin/users/:userId/remove-role — remove a single role
  app.patch("/users/:userId/remove-role", removeRoleController);

  // DELETE /admin/users/:userId/roles — clear all admin roles
  app.delete("/users/:userId/roles", clearRolesController);
}
