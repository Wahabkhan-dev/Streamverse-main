import { api } from "./client";
import type { ApiResponse, ApiLegalPage } from "./types";

export const legalApi = {
  getPrivacyPolicy() {
    return api.get<ApiResponse<ApiLegalPage>>("/legal/privacy-policy");
  },

  getTermsAndConditions() {
    return api.get<ApiResponse<ApiLegalPage>>("/legal/terms-and-conditions");
  },

  getRefundPolicy() {
    return api.get<ApiResponse<ApiLegalPage>>("/legal/refund-policy");
  },
};
