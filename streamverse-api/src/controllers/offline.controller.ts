import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import * as offlineService from "../services/offline/offline.service";
import { sendSuccess } from "../utils/apiResponse";

export async function authorize(req: Request, res: Response) {
  sendSuccess(res, await offlineService.authorizeDownload(req.params["contentId"]!, req.accessContext!), "Download authorization");
}

export async function renew(req: Request, res: Response) {
  sendSuccess(res, await offlineService.renewDownload(req.params["contentId"]!, req.accessContext!), "Download renewal");
}

/** One file of an authorised download, streamed through the API (token in ?t=, not a bearer header). */
export async function file(req: Request, res: Response) {
  const { stream, sizeBytes, mime } = await offlineService.openDownloadFile(
    req.params["contentId"]!,
    String(req.query["f"]),
    typeof req.query["t"] === "string" ? req.query["t"] : undefined,
  );
  res.status(200).set({ "Content-Type": mime, "Cache-Control": "private, no-store", ...(sizeBytes !== undefined ? { "Content-Length": String(sizeBytes) } : {}) });
  // pipeline (not pipe): when the viewer goes away mid-download the storage stream is destroyed too, instead of keeping its
  // connection to R2 open; a storage error ends the response.
  pipeline(stream, res).catch(() => undefined);
}
