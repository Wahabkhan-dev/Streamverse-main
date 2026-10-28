import type { Request, Response } from "express";
import * as mediaAccessService from "../services/mediaAccess.service";
import * as playbackSessionService from "../services/playbackSession.service";
import { ERROR_CODES } from "../constants/errors";
import { sendSuccess } from "../utils/apiResponse";
import { apiBaseOf } from "./hlsDelivery.controller";
import { AppError } from "../utils/errors";
import { logger } from "../config/logger";

/**
 * Session tracking may fail for infrastructure reasons (the user still gets to watch), but a PLAN LIMIT is a
 * deliberate refusal: swallowing it handed out a playable URL to every simultaneous request.
 */
const isLimitError = (err: unknown) => err instanceof AppError && (err.code === ERROR_CODES.CONCURRENT_STREAM_LIMIT_REACHED || err.code === ERROR_CODES.DEVICE_LIMIT_REACHED);

/**
 * Phase 8: controllers now pass `req.accessContext` (built by the `buildAccessContext` middleware) instead
 * of just `userId`. The entitlement service resolves all access rules from the context; nothing here.
 */
export async function moviePlayback(req: Request, res: Response) {
  const contentId = req.params["contentId"]!;
  const result = await mediaAccessService.getMoviePlayback(contentId, req.accessContext!, apiBaseOf(req));
  if (result.access.canConsume && req.accessContext!.userId) {
    let sessionId: string | undefined;
    try {
      const session = await playbackSessionService.startPlaybackSession(req.accessContext!.userId, contentId, "MOVIE");
      sessionId = session.sessionId;
    } catch (err) {
      if (isLimitError(err)) throw err;
      logger.warn({ err }, "mediaAccess: session tracking unavailable");
    }
    sendSuccess(res, { ...result, ...(sessionId ? { sessionId } : {}) }, "Playback authorization");
    return;
  }
  sendSuccess(res, result, "Playback authorization");
}
export async function movieTrailer(req: Request, res: Response) {
  const variant = (req.body as { variant: "trailer" | "teaser" }).variant;
  sendSuccess(res, await mediaAccessService.getMovieTrailer(req.params["contentId"]!, req.accessContext!, variant), "Trailer authorization");
}
export async function ebookAccess(req: Request, res: Response) {
  sendSuccess(res, await mediaAccessService.getEbookAccess(req.params["contentId"]!, req.accessContext!, (req.body as { format?: "pdf" } | undefined)?.format), "Access authorization");
}
export async function audiobookPlayback(req: Request, res: Response) {
  const contentId = req.params["contentId"]!;
  const result = await mediaAccessService.getAudiobookPlayback(contentId, req.accessContext!);
  if (result.access.canConsume && req.accessContext!.userId) {
    let sessionId: string | undefined;
    try {
      const session = await playbackSessionService.startPlaybackSession(req.accessContext!.userId, contentId, "AUDIOBOOK");
      sessionId = session.sessionId;
    } catch (err) {
      if (isLimitError(err)) throw err;
      logger.warn({ err }, "mediaAccess: session tracking unavailable");
    }
    sendSuccess(res, { ...result, ...(sessionId ? { sessionId } : {}) }, "Playback authorization");
    return;
  }
  sendSuccess(res, result, "Playback authorization");
}
