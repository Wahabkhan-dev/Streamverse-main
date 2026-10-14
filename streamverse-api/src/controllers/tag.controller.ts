import type { Request, Response } from "express";
import * as tagService from "../services/tag.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(_req: Request, res: Response) {
  sendSuccess(res, await tagService.listTags(), "Tags");
}
export async function create(req: Request, res: Response) {
  sendSuccess(res, await tagService.findOrCreateTag(req.body.name), "Tag", 201);
}
