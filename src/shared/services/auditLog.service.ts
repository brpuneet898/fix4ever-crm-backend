import {
  auditLogRepository,
  AuditLogFilter,
} from "../repositories/auditLog.repository";
import { AuditAction } from "../models/auditLog.model";
import { JwtPayload } from "../utils/jwt.util";

export interface AuditContext {
  actor: JwtPayload;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write an audit log entry. Fire-and-forget — never throws to caller.
 */
export async function writeAuditLog(
  ctx: AuditContext,
  action: AuditAction,
  module: string,
  opts: {
    targetId?: string;
    targetModel?: string;
    targetDescription?: string;
    changes?: Record<string, { before: unknown; after: unknown }>;
    metadata?: Record<string, unknown>;
    success?: boolean;
    errorMessage?: string;
  } = {},
): Promise<void> {
  try {
    await auditLogRepository.create({
      action,
      module,
      performedBy: ctx.actor
        .userId as unknown as import("mongoose").Types.ObjectId,
      performedByEmail: ctx.actor.email,
      performedByRole: ctx.actor.role,
      targetId: opts.targetId,
      targetModel: opts.targetModel,
      targetDescription: opts.targetDescription,
      changes: opts.changes,
      metadata: opts.metadata,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      success: opts.success ?? true,
      errorMessage: opts.errorMessage,
    });
  } catch {
    // Audit failures must never break request flows
  }
}

export async function getAuditLogs(
  filter: AuditLogFilter,
  page: number,
  limit: number,
) {
  return auditLogRepository.findPaginated(filter, page, limit);
}

export async function getEntityAuditTrail(
  targetId: string,
  targetModel?: string,
) {
  return auditLogRepository.findByTarget(targetId, targetModel);
}
