import type { Request, Response } from "express";
import { auditContext } from "../services/auditLog.service";
import * as multipartService from "../services/multipartUpload.service";
import { sendSuccess } from "../utils/apiResponse";

export async function initiate(req: Request, res: Response) {
  sendSuccess(res, await multipartService.initiateMultipartUpload(req.body, auditContext(req)), "Multipart upload initiated", 201);
}
export async function signPart(req: Request, res: Response) {
  sendSuccess(res, await multipartService.signPart(req.params["uploadId"]!, req.body.partNumber), "Part URL signed");
}
export async function complete(req: Request, res: Response) {
  sendSuccess(res, await multipartService.completeMultipart(req.params["uploadId"]!, req.body.parts, auditContext(req)), "Multipart upload completed");
}
export async function abort(req: Request, res: Response) {
  await multipartService.abortMultipart(req.params["uploadId"]!, auditContext(req));
  sendSuccess(res, null, "Multipart upload aborted");
}
