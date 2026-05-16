/**
 * Editor Routes — /editor prefix
 * Access: users with roles[] containing "editor" OR base role "admin"
 *
 * Editor CAN:
 * - Full CRUD on coupons
 * - Manage notification templates
 * - View & update categories (no delete)
 * - View referrals & basic reports
 *
 * Editor CANNOT:
 * - Users, payments, vendor control, service requests, subscriptions (create/delete)
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireRole,
  requirePermission,
} from "../../shared/middleware/permission.middleware";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { PERMISSIONS, ROLES } from "../../access";
import {
  successResponse,
  paginatedResponse,
} from "../../shared/utils/response.util";
import { audit } from "../../shared/middleware/audit.middleware";
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponAnalytics,
  deactivateExpiredCoupons,
  listNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
} from "../../shared/services/admin";

export async function editorRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook(
    "preHandler",
    requireRole([ROLES.EDITOR, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  );

  // ─── Coupons (Full CRUD) ──────────────────────────────────────────────────
  app.get(
    "/coupons",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_READ)] },
    async (req, reply) => {
      const { status, page, limit } = z
        .object({
          status: z.string().optional(),
          page: z.coerce.number().default(1),
          limit: z.coerce.number().default(20),
        })
        .parse(req.query);
      const result = await listCoupons(status, page, limit);
      return reply.send(
        paginatedResponse(
          result.coupons,
          result.total,
          page,
          limit,
          "Coupons fetched",
        ),
      );
    },
  );

  app.post(
    "/coupons",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_CREATE)] },
    async (req, reply) => {
      const body = z
        .object({
          code: z.string().min(3),
          title: z.string(),
          description: z.string().optional(),
          type: z.enum(["percentage", "flat", "cashback", "free_service"]),
          value: z.number().positive(),
          maxDiscountAmount: z.number().optional(),
          minOrderAmount: z.number().default(0),
          usageLimit: z.number().optional(),
          usagePerUser: z.number().default(1),
          eligibility: z
            .enum(["all", "new_users", "specific_users", "region"])
            .default("all"),
          eligibleRegions: z.array(z.string()).default([]),
          expiresAt: z
            .string()
            .datetime()
            .optional()
            .transform((v) => (v ? new Date(v) : undefined)),
        })
        .parse(req.body);
      const coupon = await createCoupon({
        ...body,
        createdBy: req.admin!.userId,
      });
      await audit(req, "CREATE", "coupons", {
        targetId: String(coupon._id),
        targetModel: "Coupon",
      });
      return reply.code(201).send(successResponse(coupon, "Coupon created"));
    },
  );

  app.patch(
    "/coupons/:couponId",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_UPDATE)] },
    async (req: any, reply) => {
      const coupon = await updateCoupon(
        req.params.couponId,
        req.body as Record<string, unknown>,
      );
      await audit(req, "UPDATE", "coupons", { targetId: req.params.couponId });
      return reply.send(successResponse(coupon, "Coupon updated"));
    },
  );

  app.delete(
    "/coupons/:couponId",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_DELETE)] },
    async (req: any, reply) => {
      await deleteCoupon(req.params.couponId);
      await audit(req, "DELETE", "coupons", { targetId: req.params.couponId });
      return reply.send(successResponse(null, "Coupon deleted"));
    },
  );

  app.get(
    "/coupons/analytics",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_ANALYTICS)] },
    async (_req, reply) => {
      const data = await getCouponAnalytics();
      return reply.send(successResponse(data, "Coupon analytics"));
    },
  );

  app.post(
    "/coupons/deactivate-expired",
    { preHandler: [requirePermission(PERMISSIONS.COUPONS_UPDATE)] },
    async (req, reply) => {
      const count = await deactivateExpiredCoupons();
      await audit(req, "UPDATE", "coupons", {
        metadata: { deactivatedCount: count },
      });
      return reply.send(
        successResponse({ deactivated: count }, "Expired coupons deactivated"),
      );
    },
  );

  // ─── Notification Templates ───────────────────────────────────────────────
  app.get(
    "/notification-templates",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES)] },
    async (_req, reply) => {
      const templates = await listNotificationTemplates();
      return reply.send(successResponse(templates, "Templates fetched"));
    },
  );

  app.post(
    "/notification-templates",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES)] },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string(),
          slug: z.string(),
          channel: z.enum(["email", "sms", "push", "in_app"]),
          trigger: z.string(),
          subject: z.string().optional(),
          bodyTemplate: z.string(),
          variables: z.array(z.string()).default([]),
        })
        .parse(req.body);
      const template = await createNotificationTemplate({
        ...body,
        createdBy: req.admin!.userId,
      });
      return reply
        .code(201)
        .send(successResponse(template, "Template created"));
    },
  );

  app.patch(
    "/notification-templates/:templateId",
    { preHandler: [requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES)] },
    async (req: any, reply) => {
      const template = await updateNotificationTemplate(
        req.params.templateId,
        req.body as Record<string, unknown>,
        req.admin!.userId,
      );
      return reply.send(successResponse(template, "Template updated"));
    },
  );
}
