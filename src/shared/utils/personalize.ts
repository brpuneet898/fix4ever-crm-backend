/**
 * Personalization — resolves {{variable}} tokens in message content
 * using per-user data fetched from the shared MongoDB cluster.
 *
 * Available variables:
 *   {{name}}               — User.username
 *   {{city}}               — last completed ServiceRequest.city
 *   {{deviceBrand}}        — last completed SR brand/deviceBrand
 *   {{lastServiceType}}    — last completed SR serviceType
 *   {{repairCount}}        — number of completed SRs
 *   {{subscriptionStatus}} — active subscription status, or "none"
 *
 * containsVariables() is a cheap pre-check — call it before resolvePersonalizedContent
 * to avoid unnecessary DB queries for content without any {{}} tokens.
 */
import mongoose from "mongoose";
import { User } from "../models/user.model";
import { UserSubscription } from "../models/subscription/userSubscription.model";

export interface PersonalizedContent {
  subject?: string;
  body: string;
  callToAction?: string;
}

export function containsVariables(content: PersonalizedContent): boolean {
  return [content.subject, content.body, content.callToAction]
    .filter(Boolean)
    .some((s) => /\{\{[^}]+\}\}/.test(s!));
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export async function resolvePersonalizedContent(
  userId: string,
  template: PersonalizedContent,
): Promise<PersonalizedContent> {
  const SR = mongoose.model("ServiceRequest");

  const [user, lastSR, repairCount, subscription] = await Promise.all([
    User.findById(userId).select("username").lean() as Promise<{ username?: string } | null>,
    SR.findOne({ customerId: userId, status: "Completed" })
      .sort({ updatedAt: -1 })
      .select("city brand deviceBrand serviceType")
      .lean() as Promise<{
        city?: string;
        brand?: string;
        deviceBrand?: string;
        serviceType?: string;
      } | null>,
    SR.countDocuments({ customerId: userId, status: "Completed" }),
    UserSubscription.findOne({ userId, status: { $in: ["active", "trial"] } })
      .select("status")
      .lean() as Promise<{ status: string } | null>,
  ]);

  const vars: Record<string, string> = {
    name: user?.username ?? "Customer",
    city: lastSR?.city ?? "",
    deviceBrand: lastSR?.deviceBrand ?? lastSR?.brand ?? "",
    lastServiceType: lastSR?.serviceType ?? "",
    repairCount: String(repairCount),
    subscriptionStatus: subscription?.status ?? "none",
  };

  return {
    subject: template.subject ? interpolate(template.subject, vars) : undefined,
    body: interpolate(template.body, vars),
    callToAction: template.callToAction
      ? interpolate(template.callToAction, vars)
      : undefined,
  };
}

const RESOLVE_CONCURRENCY = 50;

/**
 * Resolves personalized content for a batch of user IDs.
 * Processes RESOLVE_CONCURRENCY users in parallel to balance throughput vs memory.
 */
export async function resolvePersonalizedContentBatch(
  userIds: string[],
  template: PersonalizedContent,
): Promise<Map<string, PersonalizedContent>> {
  const result = new Map<string, PersonalizedContent>();

  for (let i = 0; i < userIds.length; i += RESOLVE_CONCURRENCY) {
    const batch = userIds.slice(i, i + RESOLVE_CONCURRENCY);
    const resolved = await Promise.all(
      batch.map((uid) => resolvePersonalizedContent(uid, template)),
    );
    batch.forEach((uid, idx) => result.set(uid, resolved[idx]));
  }

  return result;
}
