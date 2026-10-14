import type { Request, Response } from "express";
import * as myListService from "../services/myList.service";
import { sendSuccess } from "../utils/apiResponse";

// Section 77: every /me route derives the user from req.auth, never from the request itself.
export async function list(req: Request, res: Response) {
  sendSuccess(res, await myListService.listMyList(req.auth!.userId), "My List");
}
export async function add(req: Request, res: Response) {
  await myListService.addToMyList(req.auth!.userId, req.params["contentId"]!);
  sendSuccess(res, null, "Added to My List", 201);
}
export async function remove(req: Request, res: Response) {
  await myListService.removeFromMyList(req.auth!.userId, req.params["contentId"]!);
  sendSuccess(res, null, "Removed from My List");
}
