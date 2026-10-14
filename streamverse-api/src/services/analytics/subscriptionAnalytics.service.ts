import * as repo from "../../repositories/analytics.repository";
import { type DateRange, formatDate } from "../../utils/dateRange";

export interface PlanDistributionEntry {
  planId: string;
  planName: string;
  count: number;
}

export interface SubscriptionAnalyticsResult {
  activeCount: number;
  trialingCount: number;
  canceledCount: number;
  pastDueCount: number;
  newInPeriod: number;
  churnInPeriod: number;
  planDistribution: PlanDistributionEntry[];
}

export async function getSubscriptionAnalytics(range: DateRange): Promise<SubscriptionAnalyticsResult> {
  const all = await repo.getAllSubscriptionsWithPlan();

  const statusMap: Record<string, number> = {};
  const planMap: Record<string, { planName: string; count: number }> = {};
  let newInPeriod = 0;
  let churnInPeriod = 0;

  for (const sub of all) {
    statusMap[sub.status] = (statusMap[sub.status] ?? 0) + 1;

    // Plan distribution (all active/trialing)
    if (sub.status === "ACTIVE" || sub.status === "TRIALING") {
      if (!planMap[sub.planId]) planMap[sub.planId] = { planName: sub.plan.name, count: 0 };
      planMap[sub.planId]!.count++;
    }

    // New in period: subscriptions created during range
    const createdAt = sub.createdAt instanceof Date ? sub.createdAt : new Date(sub.createdAt);
    if (createdAt >= range.from && createdAt <= range.to) newInPeriod++;

    // Churn in period: moved to CANCELED during range (use canceledAt)
    if (sub.status === "CANCELED") {
      const canceledAt = sub.canceledAt instanceof Date ? sub.canceledAt : sub.canceledAt ? new Date(sub.canceledAt as string) : null;
      if (canceledAt && canceledAt >= range.from && canceledAt <= range.to) churnInPeriod++;
    }
  }

  const planDistribution: PlanDistributionEntry[] = Object.entries(planMap).map(([planId, { planName, count }]) => ({ planId, planName, count }));

  return {
    activeCount: statusMap["ACTIVE"] ?? 0,
    trialingCount: statusMap["TRIALING"] ?? 0,
    canceledCount: statusMap["CANCELED"] ?? 0,
    pastDueCount: statusMap["PAST_DUE"] ?? 0,
    newInPeriod,
    churnInPeriod,
    planDistribution,
  };
}

// Keep formatDate import alive
void formatDate;
