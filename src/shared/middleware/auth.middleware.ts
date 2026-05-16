import { FastifyRequest, FastifyReply } from "fastify";
import mongoose from "mongoose";
import { verifyAccessToken } from "../utils/jwt.util";
import { ApiError } from "../errors/ApiError";

/**
 * General authentication middleware for non-admin role-gated routes
 * (CRM, Regional, Editor). Verifies the JWT and re-validates isActive
 * from DB to ensure blocked users cannot access protected resources
 * with stale tokens.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing or invalid authorization header");
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    // Re-validate isActive — blocked users must not use stale JWTs
    const dbUser = await mongoose
      .model("User")
      .findById(payload.userId)
      .select("isActive")
      .lean<{ isActive: boolean }>();

    if (!dbUser || !dbUser.isActive) {
      throw ApiError.forbidden("Account is deactivated. Access denied.");
    }

    request.admin = payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized("Invalid or expired token");
  }
}
