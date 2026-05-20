import { FastifyInstance } from "fastify";
import { authRoutes } from "../../modules/routes/auth.routes";
import { adminRoutes as legacyAdminRoutes } from "../../modules/routes/role-assignment.routes";
import { adminInvitationRoutes } from "../../modules/routes/invitation.routes";
import { adminRoutes } from "../../modules/routes/admin.routes";
import { adminUserManagementRoutes } from "../../modules/routes/adminUserManagement.routes";
import { crmRoutes } from "../../modules/routes/crm.routes";
import { regionalRoutes } from "../../modules/routes/regional.routes";
import { editorRoutes } from "../../modules/routes/editor.routes";
import { captainRoutes } from "../../modules/routes/adminCaptain.routes";

export async function apiV1Routes(app: FastifyInstance) {
  // Auth (public)
  await app.register(authRoutes, { prefix: "/auth" });

  // Legacy role-assignment (keep backward compat)
  await app.register(legacyAdminRoutes, { prefix: "/admin/legacy" });
  await app.register(adminInvitationRoutes, { prefix: "/admin" });

  // Enterprise admin modules
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(adminUserManagementRoutes, { prefix: "/admin/users" });

  // Role-specific modules
  await app.register(crmRoutes, { prefix: "/crm" });
  await app.register(regionalRoutes, { prefix: "/regional" });
  await app.register(editorRoutes, { prefix: "/editor" });

  // Captains — permission-gated, accessible by any role with captains.* grants
  await app.register(captainRoutes, { prefix: "/captains" });
}
