import type { Request, Response } from "express";
import * as contentRepository from "../repositories/content.repository";
import { mapContentListRow } from "../mappers/content.mapper";
import { sendPaginated } from "../utils/apiResponse";
import { toSkipTake, buildPagination } from "../utils/pagination";

/**
 * Section 45: drafts ARE `Content.status = DRAFT` rows — no separate duplicate-content draft system.
 * One list across all three types, so Admin can see everything left unfinished in one place.
 */
export async function list(req: Request, res: Response) {
  const { page, limit, type, search } = req.query as unknown as { page: number; limit: number; type?: "MOVIE" | "EBOOK" | "AUDIOBOOK"; search?: string };
  const { skip, take } = toSkipTake(page, limit);
  const { rows, total } = await contentRepository.listDrafts({ type, search }, skip, take);
  sendPaginated(res, rows.map(mapContentListRow), buildPagination(total, page, limit));
}
