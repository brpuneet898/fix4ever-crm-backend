import { FastifyInstance } from "fastify";
import {
  createInvitationController,
  listInvitationsController,
  cancelInvitationController,
  resendInvitationController,
} from "../controllers/invitation.controller";
import { requireAdmin } from "../../shared/middleware/requireAdmin.middleware";

export async function adminInvitationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  app.post("/invitations", createInvitationController);
  app.get("/invitations", listInvitationsController);
  app.delete("/invitations/:id", cancelInvitationController);
  app.post("/invitations/:id/resend", resendInvitationController);
}
