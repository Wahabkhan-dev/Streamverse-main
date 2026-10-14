import { api } from "./client";
import type { ApiResponse, ApiPlan } from "./types";

export const plansApi = {
  /** GET /plans — publicly accessible */
  list() {
    return api.get<ApiResponse<ApiPlan[]>>("/plans");
  },

  /** GET /plans/:id */
  get(id: string) {
    return api.get<ApiResponse<ApiPlan>>(`/plans/${id}`);
  },
};
