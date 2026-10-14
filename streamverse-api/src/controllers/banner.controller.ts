import type { Request, Response } from "express";
import * as bannerService from "../services/banner.service";
import { auditContext } from "../services/auditLog.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";
import { NotFoundError } from "../utils/errors";

export async function list(req: Request, res: Response) {
  const { rows, pagination } = await bannerService.listBanners(req.query as never);
  sendPaginated(res, rows, pagination);
}
export async function create(req: Request, res: Response) {
  sendSuccess(res, await bannerService.createBanner(req.body, auditContext(req)), "Banner created", 201);
}
export async function getOne(req: Request, res: Response) {
  const banner = await bannerService.getBanner(req.params["id"]!);
  if (!banner) throw new NotFoundError("Banner not found");
  sendSuccess(res, banner, "Banner");
}
export async function update(req: Request, res: Response) {
  sendSuccess(res, await bannerService.updateBanner(req.params["id"]!, req.body, auditContext(req)), "Banner updated");
}
export async function remove(req: Request, res: Response) {
  await bannerService.deleteBanner(req.params["id"]!, auditContext(req));
  sendSuccess(res, null, "Banner deleted");
}
