import type { Request, Response } from "express";
import * as playbackSessionService from "../services/playbackSession.service";
import { sendSuccess } from "../utils/apiResponse";

export async function heartbeat(req: Request, res: Response) {
  await playbackSessionService.heartbeatSession(req.params["id"]!, req.auth!.userId);
  sendSuccess(res, { message: "Heartbeat recorded" });
}

export async function end(req: Request, res: Response) {
  await playbackSessionService.endPlaybackSession(req.params["id"]!, req.auth!.userId);
  sendSuccess(res, { message: "Session ended" });
}
