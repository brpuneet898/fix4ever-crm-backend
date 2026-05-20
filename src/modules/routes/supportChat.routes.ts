/**
 * CRM Support Chat Routes
 *
 * Agent-facing endpoints to review and action support chat sessions.
 * Access: crm_manager, admin, super_admin only.
 *
 * Route map:
 *   GET    /support/sessions                       — list active sessions
 *   GET    /support/sessions/:sessionId            — session detail + history
 *   POST   /support/sessions/:sessionId/assign     — agent self-assigns
 *   POST   /support/sessions/:sessionId/message    — agent sends live message
 *   POST   /support/sessions/:sessionId/resolve    — agent resolves live session
 *
 *   GET    /support/change-requests                — list pending change requests
 *   GET    /support/change-requests/:id            — request detail + audit trail
 *   POST   /support/change-requests/:id/approve    — approve → main backend executes
 *   POST   /support/change-requests/:id/reject     — reject with reason
 */
import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { requireRole } from "../../shared/middleware/permission.middleware";
import { ROLES } from "../../access";
import {
  listSupportSessions,
  getSupportSession,
  assignSession,
  sendCrmMessage,
  resolveSession,
  listChangeRequests,
  getChangeRequest,
  approveChangeRequest,
  rejectChangeRequest,
} from "../controllers/supportChat.controller";

export async function supportChatRoutes(app: FastifyInstance) {
  // All routes require CRM manager or admin role
  app.addHook("preHandler", authMiddleware);
  app.addHook(
    "preHandler",
    requireRole([ROLES.CRM_MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN])
  );

  // ── Sessions ────────────────────────────────────────────────────────────────
  app.get("/sessions", listSupportSessions);
  app.get("/sessions/:sessionId", getSupportSession);
  app.post("/sessions/:sessionId/assign", assignSession);
  app.post("/sessions/:sessionId/message", sendCrmMessage);
  app.post("/sessions/:sessionId/resolve", resolveSession);

  // ── Change Requests ─────────────────────────────────────────────────────────
  app.get("/change-requests", listChangeRequests);
  app.get("/change-requests/:id", getChangeRequest);
  app.post("/change-requests/:id/approve", approveChangeRequest);
  app.post("/change-requests/:id/reject", rejectChangeRequest);
}
