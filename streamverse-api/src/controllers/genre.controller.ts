import type { Request, Response } from "express";
import * as genreService from "../services/genre.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(_req: Request, res: Response) {
  sendSuccess(res, await genreService.listGenres(), "Genres");
}
export async function create(req: Request, res: Response) {
  sendSuccess(res, await genreService.createGenre(req.body, auditContext(req)), "Genre created", 201);
}
export async function update(req: Request, res: Response) {
  sendSuccess(res, await genreService.renameGenre(req.params["id"]!, req.body, auditContext(req)), "Genre updated");
}
export async function remove(req: Request, res: Response) {
  await genreService.deleteGenre(req.params["id"]!, auditContext(req));
  sendSuccess(res, null, "Genre deleted");
}
