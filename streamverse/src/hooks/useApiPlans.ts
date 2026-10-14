import { useQuery } from "@tanstack/react-query";
import { plansApi } from "@/api/plans.api";
import { DEMO_MODE } from "@/lib/config";
import type { ApiPlan } from "@/api/types";

export const PLANS_QUERY_KEY = ["plans"] as const;

export function useApiPlansQuery() {
  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: async () => {
      const res = await plansApi.list();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 10 * 60 * 1000, // 10 min — plans rarely change
  });
}

/** Price in dollars (converts from minor units). */
export function planPriceDollars(plan: ApiPlan): number {
  return plan.priceAmount / 100;
}

/** "Monthly" or "Yearly" from billingInterval */
export function planInterval(plan: ApiPlan): "Monthly" | "Yearly" {
  return plan.billingInterval === "MONTHLY" ? "Monthly" : "Yearly";
}
