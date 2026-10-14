import type { Request, Response } from "express";
import * as analyticsService from "../services/analytics/analytics.service";
import type { RangePreset } from "../utils/dateRange";
import { sendSuccess } from "../utils/apiResponse";
import type { GroupBy } from "../services/analytics/userAnalytics.service";
import type { RevenueGroupBy } from "../services/analytics/revenueAnalytics.service";
import type { ContentTypeFilter, MetricFilter } from "../services/analytics/contentAnalytics.service";

function extractRange(q: Record<string, unknown>) {
  return {
    preset: q["range"] as RangePreset | undefined,
    from: q["from"] as string | undefined,
    to: q["to"] as string | undefined,
  };
}

export async function usersAnalytics(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const groupBy = (q["groupBy"] as GroupBy | undefined) ?? "day";
  const data = await analyticsService.userGrowthAnalytics(preset, from, to, groupBy);
  sendSuccess(res, data, "User growth analytics");
}

export async function subscriptionsAnalytics(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const data = await analyticsService.subscriptionAnalyticsData(preset, from, to);
  sendSuccess(res, data, "Subscription analytics");
}

export async function revenueAnalytics(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const groupBy = (q["groupBy"] as RevenueGroupBy | undefined) ?? "day";
  const data = await analyticsService.revenueAnalyticsData(preset, from, to, groupBy);
  sendSuccess(res, data, "Revenue analytics");
}

export async function moviesAnalytics(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const data = await analyticsService.movieAnalyticsData(preset, from, to);
  sendSuccess(res, data, "Movie analytics");
}

export async function ebooksAnalytics(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const data = await analyticsService.ebookAnalyticsData(preset, from, to);
  sendSuccess(res, data, "eBook analytics");
}

export async function audiobooksAnalytics(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const data = await analyticsService.audiobookAnalyticsData(preset, from, to);
  sendSuccess(res, data, "Audiobook analytics");
}

export async function topContent(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const contentType = (q["contentType"] as ContentTypeFilter | undefined) ?? "all";
  const metric = (q["metric"] as MetricFilter | undefined) ?? "starts";
  const limit = Math.min(Number(q["limit"] ?? 10), 100);
  const data = await analyticsService.topContentData(preset, from, to, contentType, metric, isNaN(limit) ? 10 : limit);
  sendSuccess(res, data, "Top content");
}

export async function topGenres(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const contentType = (q["contentType"] as ContentTypeFilter | undefined) ?? "all";
  const data = await analyticsService.topGenresData(preset, from, to, contentType);
  sendSuccess(res, data, "Top genres");
}

export async function titleStats(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const { preset, from, to } = extractRange(q);
  const contentId = req.params["contentId"]!;
  const data = await analyticsService.titleStatsData(contentId, preset, from, to);
  sendSuccess(res, data, "Title stats");
}
