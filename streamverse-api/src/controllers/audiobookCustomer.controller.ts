import type { Request, Response } from "express";
import * as catalogService from "../services/catalog.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";
import type { CatalogListQuery } from "../validators/catalog.validator";

export async function list(req: Request, res: Response) {
  const { rows, pagination } = await catalogService.listAudiobooks(req.query as unknown as CatalogListQuery);
  sendPaginated(res, rows, pagination);
}

export async function getOne(req: Request, res: Response) {
  const audiobook = await catalogService.getAudiobookBySlug(req.params["slug"]!, req.auth?.userId);
  sendSuccess(res, audiobook, "Audiobook");
}
