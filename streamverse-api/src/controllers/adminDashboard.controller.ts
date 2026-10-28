import type { Request, Response } from "express";
import * as analyticsService from "../services/analytics/analytics.service";
import { sendSuccess } from "../utils/apiResponse";

/** GET /admin/dashboard — summary in the ApiAdminAnalytics shape the frontend expects. */
export async function dashboardOverview(_req: Request, res: Response) {
  const data = await analyticsService.getDashboardSummary();
  sendSuccess(res, {
    totalRevenue: Math.round((data.totalRevenueCents ?? 0) / 100),
    activeSubscriptions: data.activeSubscriptions ?? 0,
    newSignups: data.newUsersThisMonth ?? 0,
    churnRate: 0,
    series: [],
  }, "Dashboard overview");
}

export async function summary(_req: Request, res: Response) {
  const data = await analyticsService.getDashboardSummary();
  sendSuccess(res, data, "Dashboard summary");
}

export async function recentContent(req: Request, res: Response) {
  const limit = Math.min(Number(req.query["limit"] ?? 10), 50);
  const data = await analyticsService.getRecentContent(isNaN(limit) ? 10 : limit);
  sendSuccess(res, data, "Recent content");
}

export async function recentUsers(req: Request, res: Response) {
  const limit = Math.min(Number(req.query["limit"] ?? 10), 50);
  const data = await analyticsService.getRecentUsers(isNaN(limit) ? 10 : limit);
  // Strip sensitive fields from user rows
  const safe = data.map((u) => {
    const { ...rest } = u as Record<string, unknown>;
    delete rest["passwordHash"];
    delete rest["stripeCustomerId"];
    return rest;
  });
  sendSuccess(res, safe, "Recent users");
}

export async function platformStatus(_req: Request, res: Response) {
  const data = await analyticsService.getPlatformStatus();
  sendSuccess(res, data, "Platform status");
}
