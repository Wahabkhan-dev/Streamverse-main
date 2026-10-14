import type { Request, Response } from "express";
import * as libraryService from "../services/library.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response) {
  sendSuccess(res, await libraryService.listLibrary(req.auth!.userId), "Library");
}
export async function add(req: Request, res: Response) {
  await libraryService.addToLibrary(req.auth!.userId, req.params["contentId"]!);
  sendSuccess(res, null, "Added to Library", 201);
}
export async function remove(req: Request, res: Response) {
  await libraryService.removeFromLibrary(req.auth!.userId, req.params["contentId"]!);
  sendSuccess(res, null, "Removed from Library");
}
