import type { Request, Response } from "express";
import { getLiveness, getReadiness } from "../services/health.service";
import { getMetrics } from "../middleware/metrics.middleware";
import { sendError, sendSuccess } from "../utils/apiResponse";

export const health = (_req: Request, res: Response) => {
  sendSuccess(res, getLiveness(), "Service is running");
};

export const ready = async (req: Request, res: Response) => {
  const result = await getReadiness();
  if (!result.ready) {
    sendError(res, 503, "Service is not ready", [], { code: "SERVICE_UNAVAILABLE", requestId: req.id });
    return;
  }
  sendSuccess(res, result, "Service is ready");
};

/** GET /metrics — admin only; returns in-process request counters and latency percentiles. */
export const metrics = async (_req: Request, res: Response) => {
  sendSuccess(res, getMetrics(), "Metrics retrieved");
};
