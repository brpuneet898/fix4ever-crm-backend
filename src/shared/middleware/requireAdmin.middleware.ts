/**
 * Require Admin Middleware
 *
 * Protects routes by verifying JWT and ensuring user has role "admin".
 * Also re-validates isActive from DB to prevent blocked admins from using
 * stale JWTs. Sets request.admin with decoded payload.
 *
 * Use on all /admin/* routes.
 */
import { FastifyRequest, FastifyReply } from "fastify";
import mongoose from "mongoose";
import { verifyAccessToken } from "../utils/jwt.util";
import { ApiError } from "../errors/ApiError";
import { isFullAccessRole } from "../../access/roles";

export async function requireAdmin(
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

    if (!isFullAccessRole(payload.role)) {
      throw ApiError.forbidden(
        "Admin access required. Only admins can perform this action.",
      );
    }

    // Re-validate isActive from DB to handle blocked admins with valid JWTs.
    // This is a lightweight .select("isActive") query — cached at DB level.
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
