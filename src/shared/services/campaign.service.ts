/**
 * Campaign Domain Service
 *
 * Extracted from crm.service.ts so campaign logic lives in its own domain.
 * Re-exports all campaign functions for backward-compatible imports.
 */
export {
  crmListCampaigns as listCampaigns,
  crmGetCampaignDetail as getCampaignDetail,
  crmCreateCampaign as createCampaign,
  crmUpdateCampaign as updateCampaign,
  crmActivateCampaign as activateCampaign,
} from "./crm.service";
