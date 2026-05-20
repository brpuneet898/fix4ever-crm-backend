/**
 * Captain Management Routes
 *
 * Policy-driven — every route is gated purely by permission, not role.
 * Any role (admin, crm_manager, regional_manager) that holds the relevant
 * captains.* permission can access these endpoints.
 *
 * Route map:
 *  GET    /captains/stats                         — aggregate KPIs
 *  GET    /captains/settlements                   — settlement queue
 *  PATCH  /captains/settlements/:sid/approve      — approve withdrawal
 *  PATCH  /captains/settlements/:sid/reject       — reject withdrawal
 *  GET    /captains                               — list + filter
 *  GET    /captains/:id                           — full profile
 *  PATCH  /captains/:id/info                      — update personal info
 *  PATCH  /captains/:id/documents                 — update documents
 *  PATCH  /captains/:id/approve                   — approve onboarding
 *  PATCH  /captains/:id/reject                    — reject onboarding
 *  PATCH  /captains/:id/suspend                   — suspend
 *  PATCH  /captains/:id/reactivate                — reactivate
 *  GET    /captains/:id/wallet                    — wallet balance
 *  GET    /captains/:id/transactions              — wallet transactions
 *  GET    /captains/:id/wallet/analytics          — earnings analytics
 *  GET    /captains/:id/live-orders               — active assigned orders
 *  GET    /captains/:id/history                   — completed trip history
 */
import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { requirePermission } from "../../shared/middleware/permission.middleware";
import { PERMISSIONS } from "../../access";
import {
  listCaptainsController,
  getCaptainStatsController,
  getCaptainController,
  updateCaptainInfoController,
  updateCaptainDocumentsController,
  approveCaptainController,
  rejectCaptainController,
  suspendCaptainController,
  reactivateCaptainController,
  getCaptainWalletController,
  getCaptainTransactionsController,
  getCaptainWalletAnalyticsController,
  getCaptainLiveOrdersController,
  getCaptainHistoryController,
  listSettlementsController,
  approveSettlementController,
  rejectSettlementController,
} from "../controllers/adminCaptain.controller";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const r = (fn: unknown) => fn as any;

export async function captainRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // ── Stats (before :id routes to avoid param collision) ───────────────────
  app.get(
    "/stats",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_READ)] },
    r(getCaptainStatsController),
  );

  // ── Settlements ───────────────────────────────────────────────────────────
  app.get(
    "/settlements",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_WALLET_VIEW)] },
    r(listSettlementsController),
  );
  app.patch(
    "/settlements/:settlementId/approve",
    {
      preHandler: [requirePermission(PERMISSIONS.CAPTAINS_SETTLEMENTS_APPROVE)],
    },
    r(approveSettlementController),
  );
  app.patch(
    "/settlements/:settlementId/reject",
    {
      preHandler: [requirePermission(PERMISSIONS.CAPTAINS_SETTLEMENTS_APPROVE)],
    },
    r(rejectSettlementController),
  );

  // ── Captain List ──────────────────────────────────────────────────────────
  app.get(
    "/",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_READ)] },
    r(listCaptainsController),
  );

  // ── Captain Detail & Mutations ────────────────────────────────────────────
  app.get(
    "/:captainId",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_READ)] },
    r(getCaptainController),
  );
  app.patch(
    "/:captainId/info",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_UPDATE)] },
    r(updateCaptainInfoController),
  );
  app.patch(
    "/:captainId/documents",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_UPDATE)] },
    r(updateCaptainDocumentsController),
  );
  app.patch(
    "/:captainId/approve",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_APPROVE)] },
    r(approveCaptainController),
  );
  app.patch(
    "/:captainId/reject",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_APPROVE)] },
    r(rejectCaptainController),
  );
  app.patch(
    "/:captainId/suspend",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_SUSPEND)] },
    r(suspendCaptainController),
  );
  app.patch(
    "/:captainId/reactivate",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_SUSPEND)] },
    r(reactivateCaptainController),
  );

  // ── Wallet & Earnings ─────────────────────────────────────────────────────
  app.get(
    "/:captainId/wallet",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_WALLET_VIEW)] },
    r(getCaptainWalletController),
  );
  app.get(
    "/:captainId/transactions",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_WALLET_VIEW)] },
    r(getCaptainTransactionsController),
  );
  app.get(
    "/:captainId/wallet/analytics",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_WALLET_VIEW)] },
    r(getCaptainWalletAnalyticsController),
  );

  // ── Live Orders & History ─────────────────────────────────────────────────
  app.get(
    "/:captainId/live-orders",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_LIVE_ORDERS)] },
    r(getCaptainLiveOrdersController),
  );
  app.get(
    "/:captainId/history",
    { preHandler: [requirePermission(PERMISSIONS.CAPTAINS_HISTORY)] },
    r(getCaptainHistoryController),
  );
}
