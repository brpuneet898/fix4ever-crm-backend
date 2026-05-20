/**
 * Follow-Up Job — automated post-event messaging
 *
 * Runs every hour via setInterval. For each active FollowUpRule it:
 *   1. Queries ServiceRequest or UserSubscription for events in the delivery window
 *   2. Checks FollowUpLog to skip already-sent (ruleId, targetId) pairs
 *   3. Calls POST /internal/deliver-campaign on the main-app bridge
 *   4. Writes FollowUpLog entries and updates rule stats
 *
 * The delivery window for each run is [now - delayHours - 1h, now - delayHours],
 * matching the 1-hour cron interval so no events are missed or double-processed.
 */
import { FollowUpRule } from "../shared/models/followUpRule.model";
import { FollowUpLog } from "../shared/models/followUpLog.model";
import { ServiceRequest } from "../shared/models/serviceRequest/serviceRequest.model";
import { UserSubscription } from "../shared/models/subscription/userSubscription.model";
import {
  containsVariables,
  resolvePersonalizedContent,
} from "../shared/utils/personalize";

const CRON_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const BATCH_SIZE = 1000;

// ─── Core rule processor (also exported for manual "Run Now" endpoint) ────────

export async function runRule(rule: {
  _id: unknown;
  trigger: string;
  delayHours: number;
  daysBeforeExpiry?: number;
  channel: string;
  targetCities?: string[];
  content: { subject?: string; body: string; callToAction?: string };
  name: string;
}): Promise<{ sent: number; failed: number }> {
  const { env } = await import("../config/env.config");

  if (!env.MAIN_APP_URL || !env.INTERNAL_API_SECRET) {
    console.warn("[followup-job] MAIN_APP_URL / INTERNAL_API_SECRET not set — skipping");
    return { sent: 0, failed: 0 };
  }

  // ── Step 1: Resolve target events in the delivery window ─────────────────

  type Target = { targetId: string; userId: string };
  let targets: Target[] = [];

  if (rule.trigger === "service_completed") {
    const windowEnd = new Date(Date.now() - rule.delayHours * 60 * 60 * 1000);
    const windowStart = new Date(windowEnd.getTime() - CRON_INTERVAL_MS);

    const srs = await ServiceRequest.find({
      status: "Completed",
      updatedAt: { $gte: windowStart, $lt: windowEnd },
      customerId: { $exists: true, $ne: null },
    })
      .select("_id customerId")
      .lean();

    targets = srs
      .filter((sr) => sr.customerId)
      .map((sr) => ({
        targetId: String(sr._id),
        userId: String(sr.customerId),
      }));
  } else if (rule.trigger === "subscription_expiry") {
    const days = rule.daysBeforeExpiry ?? 3;
    const windowStart = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + CRON_INTERVAL_MS);

    const subs = await UserSubscription.find({
      status: { $in: ["active", "trial"] },
      endDate: { $gte: windowStart, $lt: windowEnd },
    })
      .select("_id userId")
      .lean();

    targets = subs.map((sub) => ({
      targetId: String(sub._id),
      userId: String(sub.userId),
    }));
  } else if (rule.trigger === "subscription_renewed") {
    const windowEnd = new Date(Date.now() - rule.delayHours * 60 * 60 * 1000);
    const windowStart = new Date(windowEnd.getTime() - CRON_INTERVAL_MS);

    const subs = await UserSubscription.find({
      status: "active",
      updatedAt: { $gte: windowStart, $lt: windowEnd },
    })
      .select("_id userId")
      .lean();

    targets = subs.map((sub) => ({
      targetId: String(sub._id),
      userId: String(sub.userId),
    }));
  }

  if (targets.length === 0) return { sent: 0, failed: 0 };

  // ── Step 2: Dedup — skip already-sent (ruleId, targetId) pairs ───────────

  const existingLogs = await FollowUpLog.find({
    ruleId: rule._id,
    targetId: { $in: targets.map((t) => t.targetId) },
  })
    .select("targetId")
    .lean();

  const alreadySent = new Set(existingLogs.map((l) => l.targetId));
  let pending = targets.filter((t) => !alreadySent.has(t.targetId));

  if (pending.length === 0) return { sent: 0, failed: 0 };

  // ── Step 2b: City filter (if rule has targetCities) ──────────────────────

  if (Array.isArray(rule.targetCities) && rule.targetCities.length > 0) {
    const cityPattern = rule.targetCities.map((c) => new RegExp(`^${c}$`, "i"));
    const pendingUserIds = pending.map((t) => t.userId);
    const cityMatches = await ServiceRequest.find({
      customerId: { $in: pendingUserIds },
      city: { $in: cityPattern },
    })
      .sort({ updatedAt: -1 })
      .select("customerId")
      .lean();

    const cityMatchedUserIds = new Set(
      cityMatches.map((sr) => String(sr.customerId)),
    );
    pending = pending.filter((t) => cityMatchedUserIds.has(t.userId));
  }

  if (pending.length === 0) return { sent: 0, failed: 0 };

  // ── Step 3: Call main-app bridge (personalized or batched) ───────────────

  const hasVars = containsVariables(rule.content);
  let totalSent = 0;
  let totalFailed = 0;

  if (hasVars) {
    const PERSONAL_BATCH = 50;
    for (let i = 0; i < pending.length; i += PERSONAL_BATCH) {
      const batch = pending.slice(i, i + PERSONAL_BATCH);
      await Promise.all(
        batch.map(async (target) => {
          const resolvedContent = await resolvePersonalizedContent(
            target.userId,
            rule.content,
          );
          try {
            const response = await fetch(
              `${env.MAIN_APP_URL}/internal/deliver-campaign`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": env.INTERNAL_API_SECRET!,
                },
                body: JSON.stringify({
                  users: [target.userId],
                  type: rule.channel,
                  content: resolvedContent,
                  campaignTitle: rule.name,
                  campaignId: String(rule._id),
                }),
              },
            );
            const json = (await response.json().catch(() => ({}))) as {
              sent?: number;
              failed?: number;
            };
            totalSent += json.sent ?? 0;
            totalFailed += json.failed ?? 0;
          } catch {
            totalFailed += 1;
          }
        }),
      );
    }
  } else {
    const userIds = pending.map((t) => t.userId);
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      try {
        const response = await fetch(
          `${env.MAIN_APP_URL}/internal/deliver-campaign`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": env.INTERNAL_API_SECRET!,
            },
            body: JSON.stringify({
              users: batch,
              type: rule.channel,
              content: rule.content,
              campaignTitle: rule.name,
              campaignId: String(rule._id),
            }),
          },
        );

        const json = (await response.json().catch(() => ({}))) as {
          sent?: number;
          failed?: number;
        };
        totalSent += json.sent ?? 0;
        totalFailed += json.failed ?? 0;
      } catch (err: unknown) {
        console.error(
          "[followup-job] bridge call failed:",
          err instanceof Error ? err.message : err,
        );
        totalFailed += batch.length;
      }
    }
  }

  // ── Step 4: Write dedup logs (ordered:false — dup key errors are ignored) ─

  const now = new Date();
  const targetType =
    rule.trigger === "service_completed" ? "service_request" : "subscription";

  await FollowUpLog.insertMany(
    pending.map((t) => ({
      ruleId: rule._id,
      targetId: t.targetId,
      targetType,
      userId: t.userId,
      channel: rule.channel,
      sentAt: now,
    })),
    { ordered: false },
  ).catch(() => {});

  // ── Step 5: Update rule stats ─────────────────────────────────────────────

  await FollowUpRule.findByIdAndUpdate(rule._id, {
    $inc: {
      "stats.totalSent": totalSent,
      "stats.totalFailed": totalFailed,
    },
    $set: {
      "stats.lastRunAt": now,
      "stats.lastRunSent": totalSent,
      "stats.lastRunFailed": totalFailed,
    },
  });

  console.log(
    `[followup-job] rule=${rule._id} trigger=${rule.trigger} sent=${totalSent} failed=${totalFailed}`,
  );

  return { sent: totalSent, failed: totalFailed };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

async function runAllRules() {
  let rules: Awaited<ReturnType<typeof FollowUpRule.find>>;
  try {
    rules = await FollowUpRule.find({ isActive: true }).lean();
  } catch (err: unknown) {
    console.error(
      "[followup-job] failed to load rules:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  for (const rule of rules) {
    await runRule(rule).catch((err: unknown) =>
      console.error(
        `[followup-job] rule=${rule._id} error:`,
        err instanceof Error ? err.message : err,
      ),
    );
  }
}

let jobInterval: ReturnType<typeof setInterval> | null = null;

export function startFollowUpJob(): void {
  if (jobInterval) return; // already running
  jobInterval = setInterval(() => {
    runAllRules().catch((err: unknown) =>
      console.error(
        "[followup-job] unhandled error:",
        err instanceof Error ? err.message : err,
      ),
    );
  }, CRON_INTERVAL_MS);

  console.info("[followup-job] Scheduled — runs every 1 hour");
}

export function stopFollowUpJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    console.info("[followup-job] Stopped");
  }
}
