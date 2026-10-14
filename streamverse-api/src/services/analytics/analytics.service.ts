/**
 * Orchestrates all analytics. Wraps expensive queries with a short in-memory TTL cache.
 * The 30s cache (ANALYTICS_CACHE_TTL_SECONDS) is applied to dashboard summary; historical
 * chart queries use a longer 5-min TTL.
 */
import * as repo from "../../repositories/analytics.repository";
import { analyticsCache } from "../../utils/analyticsCache";
import { type DateRange, type RangePreset, resolveRange } from "../../utils/dateRange";
import { getUserGrowth, type GroupBy } from "./userAnalytics.service";
import { getSubscriptionAnalytics } from "./subscriptionAnalytics.service";
import { getRevenueAnalytics, type RevenueGroupBy } from "./revenueAnalytics.service";
import { getMovieAnalytics, getEbookAnalytics, getAudiobookAnalytics, getTopContent, getTopGenres, getTitleStats, type ContentTypeFilter, type MetricFilter } from "./contentAnalytics.service";

const DASHBOARD_TTL = 30;      // seconds
const CHART_TTL = 5 * 60;      // 5 minutes

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

export async function getDashboardSummary() {
  return analyticsCache.getOrSet("dashboard:summary", async () => {
    const [content, users, subs, revenue] = await Promise.all([
      repo.getContentCounts(),
      repo.getUserCounts(),
      repo.getSubscriptionCounts(),
      repo.getRevenueSummary(),
    ]);
    return { ...content, ...users, ...subs, ...revenue };
  }, DASHBOARD_TTL);
}

export async function getPlatformStatus() {
  return analyticsCache.getOrSet("dashboard:platform-status", async () => {
    const [mediaAssets, subscriptions, failedLast24h] = await Promise.all([
      repo.getMediaAssetStatusCounts(),
      repo.getSubscriptionCounts(),
      repo.getFailedPaymentsLast24h(),
    ]);

    let dbStatus = "ok";
    try {
      // Simple liveness check (fakePrisma also supports $queryRaw returning a row)
      const { prisma } = await import("../../config/database.js");
    await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "error";
    }

    return {
      database: dbStatus,
      mediaAssets,
      subscriptions: { active: subscriptions.activeSubscriptions, pastDue: subscriptions.pastDueSubscriptions },
      payments: { failedLast24h },
    };
  }, DASHBOARD_TTL);
}

export async function getRecentContent(limit: number) {
  return repo.getRecentContent(limit);
}

export async function getRecentUsers(limit: number) {
  return repo.getRecentUsers(limit);
}

// ---------------------------------------------------------------------------
// Analytics endpoints (with chart-level TTL)
// ---------------------------------------------------------------------------

export async function userGrowthAnalytics(preset?: RangePreset, from?: string, to?: string, groupBy?: GroupBy) {
  const range = resolveRange(preset, from, to);
  const cacheKey = `analytics:users:${preset ?? ""}:${from ?? ""}:${to ?? ""}:${groupBy ?? "day"}`;
  return analyticsCache.getOrSet(cacheKey, () => getUserGrowth(range, groupBy), CHART_TTL);
}

export async function subscriptionAnalyticsData(preset?: RangePreset, from?: string, to?: string) {
  const range = resolveRange(preset, from, to);
  const cacheKey = `analytics:subscriptions:${preset ?? ""}:${from ?? ""}:${to ?? ""}`;
  return analyticsCache.getOrSet(cacheKey, () => getSubscriptionAnalytics(range), CHART_TTL);
}

export async function revenueAnalyticsData(preset?: RangePreset, from?: string, to?: string, groupBy?: RevenueGroupBy) {
  const range = resolveRange(preset, from, to);
  const cacheKey = `analytics:revenue:${preset ?? ""}:${from ?? ""}:${to ?? ""}:${groupBy ?? "day"}`;
  return analyticsCache.getOrSet(cacheKey, () => getRevenueAnalytics(range, groupBy), CHART_TTL);
}

export async function movieAnalyticsData(preset?: RangePreset, from?: string, to?: string) {
  const range = resolveRange(preset, from, to);
  const cacheKey = `analytics:movies:${preset ?? ""}:${from ?? ""}:${to ?? ""}`;
  return analyticsCache.getOrSet(cacheKey, () => getMovieAnalytics(range), CHART_TTL);
}

export async function ebookAnalyticsData(preset?: RangePreset, from?: string, to?: string) {
  const range = resolveRange(preset, from, to);
  const cacheKey = `analytics:ebooks:${preset ?? ""}:${from ?? ""}:${to ?? ""}`;
  return analyticsCache.getOrSet(cacheKey, () => getEbookAnalytics(range), CHART_TTL);
}

export async function audiobookAnalyticsData(preset?: RangePreset, from?: string, to?: string) {
  const range = resolveRange(preset, from, to);
  const cacheKey = `analytics:audiobooks:${preset ?? ""}:${from ?? ""}:${to ?? ""}`;
  return analyticsCache.getOrSet(cacheKey, () => getAudiobookAnalytics(range), CHART_TTL);
}

export async function topContentData(preset?: RangePreset, from?: string, to?: string, contentType?: ContentTypeFilter, metric?: MetricFilter, limit?: number) {
  const range = resolveRange(preset, from, to);
  const ct = contentType ?? "all";
  const m = metric ?? "starts";
  const l = limit ?? 10;
  const cacheKey = `analytics:top-content:${preset ?? ""}:${from ?? ""}:${to ?? ""}:${ct}:${m}:${l}`;
  return analyticsCache.getOrSet(cacheKey, () => getTopContent(range, ct, m, l), CHART_TTL);
}

export async function topGenresData(preset?: RangePreset, from?: string, to?: string, contentType?: ContentTypeFilter) {
  const range = resolveRange(preset, from, to);
  const ct = contentType ?? "all";
  const cacheKey = `analytics:top-genres:${preset ?? ""}:${from ?? ""}:${to ?? ""}:${ct}`;
  return analyticsCache.getOrSet(cacheKey, () => getTopGenres(range, ct), CHART_TTL);
}

export async function titleStatsData(contentId: string, preset?: RangePreset, from?: string, to?: string) {
  const range = resolveRange(preset, from, to);
  const cacheKey = `analytics:title:${contentId}:${preset ?? ""}:${from ?? ""}:${to ?? ""}`;
  return analyticsCache.getOrSet(cacheKey, () => getTitleStats(contentId, range), CHART_TTL);
}

// Export resolveRange for direct use in controllers
export { resolveRange };
export type { DateRange, RangePreset };
