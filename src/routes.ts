/**
 * routes.ts — Top-level API route aggregator
 *
 * Registers all versioned API routes under /api/v1.
 * This file is the canonical entry point for route registration
 * and replaces the previous api/v1/routes.ts path.
 *
 * Module structure:
 *  /auth              — public: login, register, OAuth, token refresh
 *  /admin/*           — admin/super_admin only (requireAdmin gate)
 *  /admin/users/*     — admin user management + permission overrides
 *  /crm/*             — crm_manager (+ admin): customer, SR, analytics
 *  /crm/support/*     — crm_manager (+ admin): support chat inbox + change request review
 *  /regional/*        — regional_manager (+ admin): technicians, SLA, finance
 *  /editor/*          — editor (+ admin): coupons, notification templates
 *  /internal/*        — server-to-server only (x-internal-secret guard)
 */
import { FastifyInstance } from "fastify";

// Module route imports
import { authRoutes } from "./modules/routes/auth.routes";
import { adminRoutes as legacyAdminRoutes } from "./modules/routes/role-assignment.routes";
import { adminInvitationRoutes } from "./modules/routes/invitation.routes";
import { adminRoutes } from "./modules/routes/admin.routes";
import { adminUserManagementRoutes } from "./modules/routes/adminUserManagement.routes";
import { crmRoutes } from "./modules/routes/crm.routes";
import { regionalRoutes } from "./modules/routes/regional.routes";
import { editorRoutes } from "./modules/routes/editor.routes";
import { supportChatRoutes } from "./modules/routes/supportChat.routes";
import { captainRoutes } from "./modules/routes/adminCaptain.routes";
import { handleSupportNotify } from "./modules/controllers/supportChat.controller";
import { env } from "./config/env.config";

export async function apiRoutes(app: FastifyInstance) {
  // ── Auth (public) ──────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: "/auth" });

  // ── Legacy role-assignment (backward compat) ───────────────────────────────
  await app.register(legacyAdminRoutes, { prefix: "/admin/legacy" });
  await app.register(adminInvitationRoutes, { prefix: "/admin" });

  // ── Enterprise admin modules ───────────────────────────────────────────────
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(adminUserManagementRoutes, { prefix: "/admin/users" });

  // ── Role-scoped modules ────────────────────────────────────────────────────
  await app.register(crmRoutes, { prefix: "/crm" });
  await app.register(supportChatRoutes, { prefix: "/crm/support" });
  await app.register(regionalRoutes, { prefix: "/regional" });
  await app.register(editorRoutes, { prefix: "/editor" });

  // ── Captains — permission-gated, any role with captains.* grants ───────────
  await app.register(captainRoutes, { prefix: "/captains" });

  // ── Internal bridge (main-app → CRM) ──────────────────────────────────────
  // Called by main-app backend to push real-time socket events to CRM agents.
  app.post(
    "/internal/support-notify",
    {
      preHandler: async (req, reply) => {
        const secret = env.INTERNAL_API_SECRET;
        if (!secret || req.headers["x-internal-secret"] !== secret) {
          return reply.status(401).send({ success: false, message: "Unauthorized" });
        }
      },
    },
    handleSupportNotify
  );
}

// Keep the v1-prefixed alias for backward compatibility
export { apiRoutes as apiV1Routes };
