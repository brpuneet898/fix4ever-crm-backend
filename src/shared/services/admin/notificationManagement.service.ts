/**
 * Admin Notification & Communication Management Service
 * PDF ref: Admin Section 9 — Communication & Notification Management
 */
import mongoose from "mongoose";
import { NotificationTemplate } from "../../models/notification/notificationTemplate.model";
import { ApiError } from "../../errors/ApiError";

function Notification() {
  return mongoose.model("Notification");
}

export async function broadcastNotification(data: {
  title: string;
  message: string;
  type: string;
  targetRole?: string;
  targetUsers?: string[];
  relatedId?: string;
}) {
  const query: Record<string, unknown> = {};
  let users: { _id: unknown }[] = [];

  if (data.targetUsers && data.targetUsers.length > 0) {
    users = data.targetUsers.map((id) => ({ _id: id }));
  } else if (data.targetRole) {
    users = await mongoose
      .model("User")
      .find({ role: data.targetRole, isActive: true })
      .select("_id")
      .lean();
  }

  if (users.length === 0 && !data.targetUsers) {
    users = await mongoose
      .model("User")
      .find({ isActive: true })
      .select("_id")
      .lean();
  }

  const notifications = users.map((u) => ({
    userId: u._id,
    title: data.title,
    message: data.message,
    type: data.type,
    relatedId: data.relatedId,
    isRead: false,
  }));

  const created = await Notification().insertMany(notifications);
  return { sent: created.length };
}

export async function listNotificationTemplates() {
  return NotificationTemplate.find({}).sort({ channel: 1, trigger: 1 }).lean();
}

export async function createNotificationTemplate(data: {
  name: string;
  slug: string;
  channel: string;
  trigger: string;
  subject?: string;
  bodyTemplate: string;
  variables?: string[];
  createdBy: string;
}) {
  const existing = await NotificationTemplate.findOne({ slug: data.slug });
  if (existing)
    throw ApiError.conflict("Template with this slug already exists");
  return NotificationTemplate.create(data);
}

export async function updateNotificationTemplate(
  templateId: string,
  updates: Record<string, unknown>,
  updatedBy: string,
) {
  const template = await NotificationTemplate.findByIdAndUpdate(
    templateId,
    { $set: { ...updates, updatedBy } },
    { new: true },
  );
  if (!template) throw ApiError.notFound("Template not found");
  return template;
}

export async function getNotificationStats(from?: Date, to?: Date) {
  const match =
    from || to
      ? { createdAt: { ...(from && { $gte: from }), ...(to && { $lte: to }) } }
      : {};

  return Notification().aggregate([
    { $match: match },
    {
      $group: {
        _id: "$type",
        total: { $sum: 1 },
        read: { $sum: { $cond: ["$isRead", 1, 0] } },
      },
    },
  ]);
}
