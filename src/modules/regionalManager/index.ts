/**
 * Regional Manager module — region-scoped routes.
 * Access: regional_manager role (or admin/super_admin).
 * All data is scoped to the manager's assigned region.
 */
export { regionalRoutes } from "../routes/regional.routes";
export * from "../controllers/regional.controller";
