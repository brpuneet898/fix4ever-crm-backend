/**
 * Admin module — full-access admin routes and controllers.
 * Protected by requireAdmin (base role must be admin/super_admin).
 */
export { adminRoutes } from "../routes/admin.routes";
export { adminUserManagementRoutes } from "../routes/adminUserManagement.routes";
export * from "../controllers/adminDashboard.controller";
export * from "../controllers/adminCustomer.controller";
export * from "../controllers/adminVendor.controller";
export * from "../controllers/adminPayment.controller";
export * from "../controllers/adminServiceRequest.controller";
export * from "../controllers/adminUserManagement.controller";
