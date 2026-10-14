import type { Request, Response } from "express";
import * as languageService from "../services/language.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(_req: Request, res: Response) {
  sendSuccess(res, await languageService.listLanguages(false), "Languages");
}
export async function create(req: Request, res: Response) {
  sendSuccess(res, await languageService.createLanguage(req.body), "Language created", 201);
}
