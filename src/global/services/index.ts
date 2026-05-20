/**
 * Global Services — reusable cross-module business logic.
 * Re-exports all shared services from the canonical shared/services location.
 */
export * from "../../shared/services/auth.service";
export * from "../../shared/services/auditLog.service";
export * from "../../shared/services/campaign.service";
export * from "../../shared/services/crm.service";
export * from "../../shared/services/invitation.service";
export * from "../../shared/services/regional.service";
export * from "../../shared/services/wallet.service";

// Admin sub-services
export * from "../../shared/services/admin/couponManagement.service";
export * from "../../shared/services/admin/customerManagement.service";
export * from "../../shared/services/admin/dashboard.service";
export * from "../../shared/services/admin/notificationManagement.service";
export * from "../../shared/services/admin/paymentManagement.service";
export * from "../../shared/services/admin/reportsAnalytics.service";
export * from "../../shared/services/admin/serviceRequestManagement.service";
export * from "../../shared/services/admin/subscriptionManagement.service";
export * from "../../shared/services/admin/supportTicket.service";
export * from "../../shared/services/admin/userManagement.service";
export * from "../../shared/services/admin/vendorManagement.service";
