import { FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../logger/logger";
import {
  writeAuditLog,
  AuditContext,
} from "../services/auditLog.service";
import { AuditAction } from "../models/auditLog.model";

export interface AuditEvent {
  action: string;
  performedBy: string;
  targetUser?: string;
  roles?: string[];
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export function logAuditEvent(event: Omit<AuditEvent, "timestamp">) {
  const auditEntry: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  logger.info({ audit: auditEntry }, `AUDIT: ${event.action}`);
}

/**
 * Helper to build AuditContext from a Fastify request.
 */
export function buildAuditContext(request: FastifyRequest): AuditContext {
  return {
    actor: request.admin!,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
  };
}

/**
 * Shortcut: write DB audit log from a controller/service.
 */
export async function audit(
  request: FastifyRequest,
  action: AuditAction,
  module: string,
  opts: Parameters<typeof writeAuditLog>[3] = {},
) {
  await writeAuditLog(buildAuditContext(request), action, module, opts);
}

// Fastify hook: logs every authenticated admin request
export async function auditMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  if (request.admin) {
    logger.info(
      {
        audit: {
          method: request.method,
          url: request.url,
          performedBy: request.admin.userId,
          role: request.admin.role,
          timestamp: new Date().toISOString(),
        },
      },
      `AUDIT: ${request.method} ${request.url}`,
    );
  }
}
