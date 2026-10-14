import type { Request, Response } from "express";
import * as genreService from "../services/genre.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(_req: Request, res: Response) {
  sendSuccess(res, await genreService.listActiveGenres(), "Genres");
}
