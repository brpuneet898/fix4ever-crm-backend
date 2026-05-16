/**
 * WebSocket Server (Socket.IO)
 *
 * PDF ref: Admin Section 1 + note on page 18
 * - Admin dashboard live updates when endpoints are hit
 * - Service request lifecycle tracking
 * - Notification sync
 * - Regional manager real-time feed
 *
 * Rooms / namespaces:
 *   admin_dashboard   — all admins / super_admins
 *   crm_room          — crm_managers
 *   regional_{region} — regional_managers for a region
 *   user_{userId}     — individual user notifications
 */
import { Server as HttpServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.config";
import { logger } from "../../shared/logger/logger";

let _io: IOServer | null = null;

export function getIO(): IOServer {
  if (!_io) throw new Error("Socket.IO server not initialized");
  return _io;
}

export function initSocketServer(httpServer: HttpServer): IOServer {
  _io = new IOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN || "http://localhost:1420",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // ── Auth middleware ─────────────────────────────────────────────────────────
  _io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("Authentication token required"));

    try {
      const payload = jwt.verify(token, env.JWT_SECRET!) as {
        userId: string;
        role: string;
        roles: string[];
        region?: string;
      };
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      socket.data.roles = payload.roles ?? [];
      socket.data.region = payload.region;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  _io.on("connection", (socket: Socket) => {
    const { userId, role, roles, region } = socket.data;

    logger.info({ userId, role }, "Socket connected");

    // Auto-join rooms based on role
    if (role === "admin" || role === "super_admin") {
      socket.join("admin_dashboard");
      socket.join("crm_room");
    }

    if (roles?.includes("crm_manager")) {
      socket.join("crm_room");
    }

    if (roles?.includes("regional_manager") && region) {
      socket.join(`regional_${region.toLowerCase().replace(/\s+/g, "_")}`);
      socket.join("regional_all");
    }

    // Always join personal room
    socket.join(`user_${userId}`);

    socket.on("disconnect", () => {
      logger.info({ userId }, "Socket disconnected");
    });
  });

  logger.info("Socket.IO server initialized");
  return _io;
}
