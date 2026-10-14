import type { Request, Response } from "express";
import { auditContext } from "../services/auditLog.service";
import * as uploadService from "../services/upload.service";
import { sendSuccess } from "../utils/apiResponse";

export async function presign(req: Request, res: Response) {
  sendSuccess(res, await uploadService.presignUpload(req.body, auditContext(req)), "Upload URL created", 201);
}
export async function complete(req: Request, res: Response) {
  sendSuccess(res, await uploadService.completeUpload(req.params["assetId"]!, auditContext(req)), "Upload completed");
}
export async function abort(req: Request, res: Response) {
  await uploadService.abortUpload(req.params["assetId"]!, auditContext(req));
  sendSuccess(res, null, "Upload aborted");
}
export async function status(req: Request, res: Response) {
  sendSuccess(res, await uploadService.getUploadStatus(req.params["assetId"]!), "Upload status");
}
