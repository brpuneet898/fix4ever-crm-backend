import { AuditLog, IAuditLog } from "../models/auditLog.model";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilterQuery<T> = Record<string, any>;

export interface AuditLogFilter {
  module?: string;
  action?: string;
  performedBy?: string;
  targetId?: string;
  targetModel?: string;
  from?: Date;
  to?: Date;
  success?: boolean;
}

export const auditLogRepository = {
  async create(data: Omit<IAuditLog, "timestamp">): Promise<void> {
    await AuditLog.create({ ...data, timestamp: new Date() });
  },

  async findPaginated(filter: AuditLogFilter, page: number, limit: number) {
    const query: FilterQuery<IAuditLog> = {};

    if (filter.module) query.module = filter.module;
    if (filter.action) query.action = filter.action;
    if (filter.performedBy) query.performedBy = filter.performedBy;
    if (filter.targetId) query.targetId = filter.targetId;
    if (filter.targetModel) query.targetModel = filter.targetModel;
    if (filter.success !== undefined) query.success = filter.success;

    if (filter.from || filter.to) {
      query.timestamp = {};
      if (filter.from) query.timestamp.$gte = filter.from;
      if (filter.to) query.timestamp.$lte = filter.to;
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return { logs, total };
  },

  async findByTarget(targetId: string, targetModel?: string, limit = 100) {
    const query: FilterQuery<IAuditLog> = { targetId };
    if (targetModel) query.targetModel = targetModel;
    return AuditLog.find(query).sort({ timestamp: -1 }).limit(limit).lean();
  },

  async findByUser(userId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find({ performedBy: userId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments({ performedBy: userId }),
    ]);
    return { logs, total };
  },
};
