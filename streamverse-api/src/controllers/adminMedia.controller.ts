import type { Request, Response } from "express";
import * as adminMediaService from "../services/adminMedia.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";

export async function listForContent(req: Request, res: Response) {
  sendSuccess(res, await adminMediaService.listMediaForContent(req.params["contentId"]!), "Media assets");
}
export async function remove(req: Request, res: Response) {
  await adminMediaService.deleteMedia(req.params["assetId"]!, auditContext(req));
  sendSuccess(res, null, "Media asset deleted");
}
export async function checkAttachable(req: Request, res: Response) {
  sendSuccess(res, await adminMediaService.checkAttachable(req.params["contentId"]!, req.params["assetId"]!), "Attachability checked");
}
export async function retryProcessing(req: Request, res: Response) {
  sendSuccess(res, await adminMediaService.retryProcessingForAsset(req.params["assetId"]!, auditContext(req)), "Processing retried");
}
