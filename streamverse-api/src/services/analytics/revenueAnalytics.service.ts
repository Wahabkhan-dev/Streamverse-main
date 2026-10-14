import * as repo from "../../repositories/analytics.repository";
import { type DateRange, dailyBuckets, monthlyBuckets, formatDate } from "../../utils/dateRange";

export type RevenueGroupBy = "day" | "month";

export interface RevenueTimeSeriesPoint {
  date: string;
  grossCents: number;
  refundedCents: number;
}

export interface CurrencyBreakdown {
  currency: string;
  grossCents: number;
  refundedCents: number;
  netCents: number;
}

export interface RevenueAnalyticsResult {
  grossRevenueCents: number;
  refundedCents: number;
  netRevenueCents: number;
  successfulPayments: number;
  failedPayments: number;
  byCurrency: CurrencyBreakdown[];
  timeSeries: RevenueTimeSeriesPoint[];
}

export async function getRevenueAnalytics(range: DateRange, groupBy: RevenueGroupBy = "day"): Promise<RevenueAnalyticsResult> {
  const [payments, refunds, failedPayments, successfulPayments] = await Promise.all([
    repo.getPaymentsInRange(range.from, range.to),
    repo.getRefundsInRange(range.from, range.to),
    repo.getFailedPaymentsInRange(range.from, range.to),
    repo.getSucceededPaymentsCount(range.from, range.to),
  ]);

  // Currency-level aggregation (never mix currencies)
  const currencyGross: Record<string, number> = {};
  const currencyRefunded: Record<string, number> = {};

  for (const p of payments) {
    const c = p.currency.toLowerCase();
    currencyGross[c] = (currencyGross[c] ?? 0) + p.amount;
  }
  for (const r of refunds) {
    const c = r.currency.toLowerCase();
    currencyRefunded[c] = (currencyRefunded[c] ?? 0) + r.amount;
  }

  const byCurrency: CurrencyBreakdown[] = Object.keys({ ...currencyGross, ...currencyRefunded }).map((currency) => {
    const grossCents = currencyGross[currency] ?? 0;
    const refundedCents = currencyRefunded[currency] ?? 0;
    return { currency, grossCents, refundedCents, netCents: grossCents - refundedCents };
  });

  // Totals (sum across all currencies — only meaningful if single-currency, but computed for convenience)
  const grossRevenueCents = Object.values(currencyGross).reduce((a, b) => a + b, 0);
  const refundedTotal = Object.values(currencyRefunded).reduce((a, b) => a + b, 0);
  const netRevenueCents = grossRevenueCents - refundedTotal;

  // Time series
  const buckets = groupBy === "month" ? monthlyBuckets(range.from, range.to) : dailyBuckets(range.from, range.to);
  const tsGross: Record<string, number> = {};
  const tsRefunded: Record<string, number> = {};
  for (const bucket of buckets) {
    tsGross[bucket] = 0;
    tsRefunded[bucket] = 0;
  }

  for (const p of payments) {
    const date = p.paidAt ?? p.createdAt;
    const key = matchBucket(date instanceof Date ? date : new Date(date), buckets, groupBy);
    if (key) tsGross[key] = (tsGross[key] ?? 0) + p.amount;
  }
  for (const r of refunds) {
    const key = matchBucket(r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt), buckets, groupBy);
    if (key) tsRefunded[key] = (tsRefunded[key] ?? 0) + r.amount;
  }

  const timeSeries: RevenueTimeSeriesPoint[] = buckets.map((date) => ({
    date,
    grossCents: tsGross[date] ?? 0,
    refundedCents: tsRefunded[date] ?? 0,
  }));

  return {
    grossRevenueCents,
    refundedCents: refundedTotal,
    netRevenueCents,
    successfulPayments,
    failedPayments,
    byCurrency,
    timeSeries,
  };
}

function matchBucket(date: Date, buckets: string[], groupBy: RevenueGroupBy): string | null {
  if (!buckets.length) return null;
  const dateStr = formatDate(date);
  if (groupBy === "day") {
    return buckets.includes(dateStr) ? dateStr : null;
  }
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (dateStr >= buckets[i]!) return buckets[i]!;
  }
  return null;
}
