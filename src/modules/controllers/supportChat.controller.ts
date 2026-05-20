/**
 * CRM Support Chat Controller
 *
 * Handles the CRM agent side of the support chat system.
 * Agents review pending change requests (approve/reject) and handle live chat sessions.
 * All mutations are executed on the main backend via internal HTTP calls.
 */
import { FastifyRequest, FastifyReply } from "fastify";
import axios from "axios";
import mongoose from "mongoose";
import { z } from "zod";
import { SupportChatSession } from "../../shared/models/supportChatSession.model";
import { SupportChangeRequest } from "../../shared/models/supportChangeRequest.model";
import { getIO } from "../../infrastructure/websocket/socket.server";
import { env } from "../../config/env.config";

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Call the main backend's internal API */
async function callMainBackend(path: string, body: Record<string, any>) {
  const mainUrl = env.MAIN_BACKEND_URL || "http://localhost:8080";
  const secret = env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("INTERNAL_API_SECRET not configured");

  const response = await axios.post(`${mainUrl}/internal/support/${path}`, body, {
    headers: { "x-internal-secret": secret },
    timeout: 8000,
  });
  return response.data;
}

function agentFromRequest(req: FastifyRequest) {
  // authMiddleware sets request.admin (not request.user) — see auth.middleware.ts line 36
  const payload = (req as any).admin ?? (req as any).user;
  return {
    agentId: payload?.userId as string,
    agentName: (payload?.username || payload?.name || payload?.email || "CRM Agent") as string,
  };
}

// ─── GET /crm/support/sessions ────────────────────────────────────────────────
// List all active sessions (pending_crm_review + crm_live), newest first.
export async function listSupportSessions(req: FastifyRequest, reply: FastifyReply) {
  const query = (req.query as any);
  const status = query.status || ["pending_crm_review", "crm_live"];
  const page = parseInt(query.page || "1", 10);
  const limit = parseInt(query.limit || "20", 10);

  const filter: Record<string, any> = {
    status: Array.isArray(status) ? { $in: status } : status,
  };

  const [sessions, total] = await Promise.all([
    SupportChatSession.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SupportChatSession.countDocuments(filter),
  ]);

  return reply.send({
    success: true,
    data: sessions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// ─── GET /crm/support/sessions/:sessionId ─────────────────────────────────────
export async function getSupportSession(req: FastifyRequest, reply: FastifyReply) {
  const { sessionId } = req.params as { sessionId: string };

  const session = await SupportChatSession.findOne({ sessionId }).lean();
  if (!session) {
    return reply.status(404).send({ success: false, message: "Session not found" });
  }

  const changeRequests = await SupportChangeRequest.find({ sessionId: session._id })
    .sort({ createdAt: -1 })
    .lean();

  return reply.send({ success: true, data: { session, changeRequests } });
}

// ─── GET /crm/support/change-requests ────────────────────────────────────────
export async function listChangeRequests(req: FastifyRequest, reply: FastifyReply) {
  const query = (req.query as any);
  const status = query.status || "pending";
  const page = parseInt(query.page || "1", 10);
  const limit = parseInt(query.limit || "20", 10);

  const filter: Record<string, any> = {
    status: Array.isArray(status) ? { $in: status } : status,
  };

  const [requests, total] = await Promise.all([
    SupportChangeRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SupportChangeRequest.countDocuments(filter),
  ]);

  return reply.send({
    success: true,
    data: requests,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// ─── GET /crm/support/change-requests/:id ────────────────────────────────────
export async function getChangeRequest(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };

  const cr = await SupportChangeRequest.findById(id).lean();
  if (!cr) {
    return reply.status(404).send({ success: false, message: "Change request not found" });
  }

  const session = await SupportChatSession.findById(cr.sessionId).lean();

  return reply.send({ success: true, data: { changeRequest: cr, session } });
}

// ─── POST /crm/support/change-requests/:id/approve ───────────────────────────
const ApproveSchema = z.object({ note: z.string().optional() });

export async function approveChangeRequest(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const { agentId, agentName } = agentFromRequest(req);
  const body = ApproveSchema.parse(req.body);

  const cr = await SupportChangeRequest.findById(id);
  if (!cr) return reply.status(404).send({ success: false, message: "Not found" });
  if (cr.status !== "pending") {
    return reply.status(400).send({ success: false, message: "Only pending requests can be approved" });
  }

  // Mark approved in the shared DB so the state is consistent before execution
  cr.status = "approved";
  cr.reviewedBy = toObjectId(agentId);
  cr.reviewedByName = agentName;
  cr.reviewedAt = new Date();
  cr.auditTrail.push({
    action: "approved",
    performedBy: toObjectId(agentId),
    performedByRole: "crm_agent",
    performedByName: agentName,
    timestamp: new Date(),
    note: body.note || `Approved by ${agentName}`,
  });
  await cr.save();

  // Tell main backend to execute the change and notify the customer
  await callMainBackend("execute-change", {
    changeRequestId: id,
    approvedBy: agentId,
    approvedByName: agentName,
  });

  // Notify other CRM agents that this request has been handled
  try {
    getIO().to("crm_room").emit("crm:change-request-updated", {
      changeRequestId: id,
      status: "approved",
      handledBy: agentName,
    });
  } catch (_) {}

  return reply.send({ success: true, message: "Change request approved and executed" });
}

// ─── POST /crm/support/change-requests/:id/reject ────────────────────────────
const RejectSchema = z.object({
  reason: z.string().min(5, "Please provide a reason (min 5 characters)"),
});

export async function rejectChangeRequest(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const { agentId, agentName } = agentFromRequest(req);
  const body = RejectSchema.parse(req.body);

  const cr = await SupportChangeRequest.findById(id);
  if (!cr) return reply.status(404).send({ success: false, message: "Not found" });
  if (cr.status !== "pending") {
    return reply.status(400).send({ success: false, message: "Only pending requests can be rejected" });
  }

  cr.status = "rejected";
  cr.rejectionReason = body.reason;
  cr.reviewedBy = toObjectId(agentId);
  cr.reviewedByName = agentName;
  cr.reviewedAt = new Date();
  cr.auditTrail.push({
    action: "rejected",
    performedBy: toObjectId(agentId),
    performedByRole: "crm_agent",
    performedByName: agentName,
    timestamp: new Date(),
    note: body.reason,
  });
  await cr.save();

  await callMainBackend("reject-change", {
    changeRequestId: id,
    rejectedBy: agentId,
    rejectedByName: agentName,
    reason: body.reason,
  });

  try {
    getIO().to("crm_room").emit("crm:change-request-updated", {
      changeRequestId: id,
      status: "rejected",
      handledBy: agentName,
    });
  } catch (_) {}

  return reply.send({ success: true, message: "Change request rejected" });
}

// ─── POST /crm/support/sessions/:sessionId/assign ────────────────────────────
export async function assignSession(req: FastifyRequest, reply: FastifyReply) {
  const { sessionId } = req.params as { sessionId: string };
  const { agentId, agentName } = agentFromRequest(req);

  const session = await SupportChatSession.findOne({ sessionId });
  if (!session) return reply.status(404).send({ success: false, message: "Session not found" });

  session.assignedCrmAgentId = toObjectId(agentId);
  session.crmAgentName = agentName;
  await session.save();

  // Announce to customer via main backend socket bridge
  await callMainBackend("crm-join", { sessionId, agentId, agentName });

  return reply.send({ success: true });
}

// ─── POST /crm/support/sessions/:sessionId/message ───────────────────────────
const MessageSchema = z.object({ content: z.string().min(1) });

export async function sendCrmMessage(req: FastifyRequest, reply: FastifyReply) {
  const { sessionId } = req.params as { sessionId: string };
  const { agentId, agentName } = agentFromRequest(req);
  const body = MessageSchema.parse(req.body);

  await callMainBackend("crm-reply", {
    sessionId,
    content: body.content,
    agentId,
    agentName,
  });

  return reply.send({ success: true });
}

// ─── POST /crm/support/sessions/:sessionId/resolve ───────────────────────────
const ResolveSchema = z.object({ note: z.string().optional() });

export async function resolveSession(req: FastifyRequest, reply: FastifyReply) {
  const { sessionId } = req.params as { sessionId: string };
  const { agentId, agentName } = agentFromRequest(req);
  const body = ResolveSchema.parse(req.body);

  await callMainBackend("crm-resolve", {
    sessionId,
    agentId,
    agentName,
    note: body.note || "Your issue has been resolved. Thank you for contacting us!",
  });

  return reply.send({ success: true, message: "Session resolved" });
}

// ─── POST /internal/support-notify ───────────────────────────────────────────
// Called BY main backend → push real-time event to CRM agents in crm_room.
export async function handleSupportNotify(req: FastifyRequest, reply: FastifyReply) {
  const { event, payload } = req.body as { event: string; payload: Record<string, any> };

  try {
    const io = getIO();

    if (event === "new_change_request") {
      io.to("crm_room").emit("crm:new-change-request", payload);
    } else if (event === "change_request_resubmitted") {
      io.to("crm_room").emit("crm:change-request-resubmitted", payload);
    } else if (event === "new_live_session") {
      io.to("crm_room").emit("crm:new-live-session", payload);
    } else if (event === "customer_message") {
      // Customer sent a live-chat message — forward to all CRM agents so the
      // assigned agent's LiveChatPanel receives it without a page refresh.
      io.to("crm_room").emit("crm:customer-message", payload);
    } else if (event === "customer_typing") {
      // Customer is typing — forward so the agent sees the typing indicator.
      io.to("crm_room").emit("crm:customer-typing", payload);
    }

    return reply.send({ success: true });
  } catch (err: any) {
    return reply.status(500).send({ success: false, message: err.message });
  }
}
