import type { Request, Response } from "express";
import * as mediaAccessService from "../services/mediaAccess.service";
import * as playbackSessionService from "../services/playbackSession.service";
import { sendSuccess } from "../utils/apiResponse";

/**
 * Phase 8: controllers now pass `req.accessContext` (built by the `buildAccessContext` middleware) instead
 * of just `userId`. The entitlement service resolves all access rules from the context; nothing here.
 */
export async function moviePlayback(req: Request, res: Response) {
  const contentId = req.params["contentId"]!;
  const result = await mediaAccessService.getMoviePlayback(contentId, req.accessContext!);
  if (result.access.canConsume && req.accessContext!.userId) {
    let sessionId: string | undefined;
    try {
      const session = await playbackSessionService.startPlaybackSession(req.accessContext!.userId, contentId, "MOVIE");
      sessionId = session.sessionId;
    } catch (err) {
      console.warn("[mediaAccess] session tracking unavailable:", (err as Error).message);
    }
    sendSuccess(res, { ...result, ...(sessionId ? { sessionId } : {}) }, "Playback authorization");
    return;
  }
  sendSuccess(res, result, "Playback authorization");
}
export async function ebookAccess(req: Request, res: Response) {
  sendSuccess(res, await mediaAccessService.getEbookAccess(req.params["contentId"]!, req.accessContext!), "Access authorization");
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
      console.warn("[mediaAccess] session tracking unavailable:", (err as Error).message);
    }
    sendSuccess(res, { ...result, ...(sessionId ? { sessionId } : {}) }, "Playback authorization");
    return;
  }
  sendSuccess(res, result, "Playback authorization");
}
