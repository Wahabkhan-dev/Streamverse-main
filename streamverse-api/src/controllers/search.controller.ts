import type { Request, Response } from "express";
import * as searchService from "../services/search.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";
import type { SearchQuery } from "../validators/search.validator";

export async function search(req: Request, res: Response) {
  const { rows, pagination } = await searchService.search(req.query as unknown as SearchQuery);
  sendPaginated(res, rows as unknown[], pagination);
}

export async function suggestions(req: Request, res: Response) {
  sendSuccess(res, await searchService.suggest((req.query["q"] as string) ?? ""), "Suggestions");
}
