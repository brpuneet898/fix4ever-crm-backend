/**
 * CRM module — CRM Manager routes.
 * Access: crm_manager role (or admin/super_admin).
 * All endpoints enforce granular PBAC via policy engine.
 */
export { crmRoutes } from "../routes/crm.routes";
export * from "../controllers/crm.controller";
