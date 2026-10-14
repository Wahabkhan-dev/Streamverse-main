import type { Request, Response } from "express";
import { getLiveness, getReadiness } from "../services/health.service";
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
