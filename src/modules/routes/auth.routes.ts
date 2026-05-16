import { FastifyInstance } from "fastify";
import {
  googleLoginController,
  emailLoginController,
  registerController,
  refreshTokenController,
  getMeController,
  devCreateAdminController,
} from "../controllers/auth.controller";
import {
  getInvitationByTokenController,
  acceptInvitationController,
} from "../controllers/invitation.controller";
import { authMiddleware } from "../../shared/middleware/auth.middleware";

export async function authRoutes(app: FastifyInstance) {
  app.post("/google", googleLoginController);
  app.post("/login", emailLoginController);
  app.post("/register", registerController);
  app.post("/refresh", refreshTokenController);
  app.get("/me", { preHandler: [authMiddleware] }, getMeController);

  // Public: invitation flow (no auth required)
  app.get("/invite/:token", getInvitationByTokenController);
  app.post("/invite/:token/accept", acceptInvitationController);

  // Dev-only: seed an admin account for testing
  app.post("/dev/create-admin", devCreateAdminController);
}
