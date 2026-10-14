import type { Request, Response } from "express";
import * as bookmarkService from "../services/bookmark.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response) {
  sendSuccess(res, await bookmarkService.listBookmarks(req.auth!.userId, req.params["ebookId"]!), "Bookmarks");
}
export async function create(req: Request, res: Response) {
  sendSuccess(res, await bookmarkService.createBookmark(req.auth!.userId, req.params["ebookId"]!, req.body), "Bookmark created", 201);
}
export async function remove(req: Request, res: Response) {
  await bookmarkService.deleteBookmark(req.auth!.userId, req.params["bookmarkId"]!);
  sendSuccess(res, null, "Bookmark deleted");
}
