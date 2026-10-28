import type { Request, Response } from "express";
import { auditContext } from "../services/auditLog.service";
import * as mediaLibraryService from "../services/mediaLibrary.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";
import type { LibraryListQuery } from "../validators/mediaLibrary.validator";

export async function list(req: Request, res: Response) {
  const { items, pagination } = await mediaLibraryService.listMedia(req.query as unknown as LibraryListQuery);
  sendPaginated(res, items, pagination, "Media library");
}
export async function stats(_req: Request, res: Response) {
  sendSuccess(res, await mediaLibraryService.mediaStats(), "Media library stats");
}
export async function detail(req: Request, res: Response) {
  sendSuccess(res, await mediaLibraryService.getMedia(req.params["assetId"]!), "Media asset");
}
export async function update(req: Request, res: Response) {
  sendSuccess(res, await mediaLibraryService.updateMetadata(req.params["assetId"]!, req.body, auditContext(req)), "Media updated");
}
export async function replace(req: Request, res: Response) {
  sendSuccess(res, await mediaLibraryService.replaceMedia(req.params["assetId"]!, req.body.newAssetId, auditContext(req)), "Media replaced");
}
export async function remove(req: Request, res: Response) {
  await mediaLibraryService.deleteMedia(req.params["assetId"]!, auditContext(req));
  sendSuccess(res, null, "Media asset deleted");
}
export async function bulkDelete(req: Request, res: Response) {
  sendSuccess(res, await mediaLibraryService.bulkDelete(req.body.ids, auditContext(req)), "Bulk delete finished");
}
export async function reconcile(req: Request, res: Response) {
  sendSuccess(res, await mediaLibraryService.reconcile(req.body), "Reconciliation report");
}
