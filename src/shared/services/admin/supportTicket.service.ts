/**
 * Support Ticket Management Service
 * PDF ref: Admin Section 11 — Dispute, Complaint & Support Management
 */
import mongoose from "mongoose";
import {
  SupportTicket,
  TicketCategory,
  TicketPriority,
} from "../../models/supportTicket.model";
import { ApiError } from "../../errors/ApiError";

/**
 * Atomic, cluster-safe ticket ID using MongoDB Counter collection.
 * Format: TKT-YYYYMM-NNNNNN (e.g. TKT-202603-000042)
 * Uses the existing Counter model ($inc is atomic in MongoDB).
 */
async function generateTicketId(): Promise<string> {
  const now = new Date();
  const key = `ticket_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const counter = await mongoose
    .model("Counter")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
  const seq = String((counter as { seq: number }).seq).padStart(6, "0");
  return `TKT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${seq}`;
}

export async function listTickets(filter: {
  status?: string;
  priority?: string;
  category?: string;
  assignedTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = {};

  if (filter.status) query.status = filter.status;
  if (filter.priority) query.priority = filter.priority;
  if (filter.category) query.category = filter.category;
  if (filter.assignedTo) query.assignedTo = filter.assignedTo;
  if (filter.search) {
    query.$or = [
      { ticketId: { $regex: filter.search, $options: "i" } },
      { title: { $regex: filter.search, $options: "i" } },
    ];
  }

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("raisedBy", "username email")
      .populate("assignedTo", "username email")
      .lean(),
    SupportTicket.countDocuments(query),
  ]);

  return { tickets, total };
}

export async function createTicket(data: {
  title: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority;
  source?: string;
  raisedBy: string;
  raisedByRole: string;
  relatedServiceRequest?: string;
  relatedVendor?: string;
}) {
  const slaDeadline = new Date();
  slaDeadline.setHours(
    slaDeadline.getHours() +
      (data.priority === "critical" ? 4 : data.priority === "high" ? 12 : 48),
  );

  const ticketId = await generateTicketId();

  return SupportTicket.create({
    ticketId,
    ...data,
    slaDeadline,
    slaBreached: false,
    messages: [],
  });
}

export async function assignTicket(ticketId: string, assignedTo: string) {
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    { $set: { assignedTo, assignedAt: new Date(), status: "in_progress" } },
    { new: true },
  );
  if (!ticket) throw ApiError.notFound("Ticket not found");
  return ticket;
}

export async function addTicketMessage(
  ticketId: string,
  senderId: string,
  senderRole: string,
  message: string,
  attachments?: string[],
) {
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    {
      $push: {
        messages: {
          senderId,
          senderRole,
          message,
          attachments: attachments ?? [],
          timestamp: new Date(),
        },
      },
    },
    { new: true },
  );
  if (!ticket) throw ApiError.notFound("Ticket not found");
  return ticket;
}

export async function resolveTicket(
  ticketId: string,
  resolvedBy: string,
  resolutionNote: string,
) {
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    {
      $set: {
        status: "resolved",
        resolvedAt: new Date(),
        resolvedBy,
        resolutionNote,
      },
    },
    { new: true },
  );
  if (!ticket) throw ApiError.notFound("Ticket not found");
  return ticket;
}

export async function escalateTicket(
  ticketId: string,
  escalatedTo: string,
  note: string,
) {
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    {
      $set: {
        status: "escalated",
        escalatedTo,
        escalatedAt: new Date(),
      },
      $push: {
        messages: {
          senderId: escalatedTo,
          senderRole: "admin",
          message: `Escalated: ${note}`,
          timestamp: new Date(),
        },
      },
    },
    { new: true },
  );
  if (!ticket) throw ApiError.notFound("Ticket not found");
  return ticket;
}

export async function issueCompensation(
  ticketId: string,
  issuedBy: string,
  compensation: {
    type: "refund" | "wallet_credit" | "re_service" | "discount";
    amount?: number;
    note?: string;
  },
) {
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    {
      $set: {
        compensation: {
          ...compensation,
          issuedBy,
          issuedAt: new Date(),
        },
      },
    },
    { new: true },
  );
  if (!ticket) throw ApiError.notFound("Ticket not found");
  return ticket;
}
