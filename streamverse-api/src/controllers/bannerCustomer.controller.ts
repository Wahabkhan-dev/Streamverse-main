import type { Request, Response } from "express";
import * as bannerService from "../services/banner.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response) {
  const type = req.query["type"] as "HERO" | "NORMAL" | "LATEST_RELEASE" | "PROMOTIONAL" | undefined;
  const placement = req.query["placement"] as "MOVIES" | "EBOOKS" | "AUDIOBOOKS" | undefined;
  sendSuccess(res, await bannerService.listActiveBannersForCustomer(type, placement), "Banners");
}
