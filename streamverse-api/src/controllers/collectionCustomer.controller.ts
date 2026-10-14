import type { Request, Response } from "express";
import * as collectionService from "../services/collection.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response) {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const { rows, pagination } = await collectionService.listPublishedCollections(page, limit);
  sendPaginated(
    res,
    rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, bannerAssetId: c.bannerAssetId })),
    pagination,
  );
}

export async function getOne(req: Request, res: Response) {
  sendSuccess(res, await collectionService.getPublishedCollectionBySlug(req.params["slug"]!), "Collection");
}
