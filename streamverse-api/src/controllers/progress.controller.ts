import type { Request, Response } from "express";
import * as progressService from "../services/progress.service";
import { sendSuccess } from "../utils/apiResponse";

export async function getMovie(req: Request, res: Response) {
  sendSuccess(res, await progressService.getMovieProgress(req.auth!.userId, req.params["id"]!), "Movie progress");
}
export async function putMovie(req: Request, res: Response) {
  sendSuccess(res, await progressService.saveMovieProgress(req.auth!.userId, req.params["id"]!, req.body), "Progress saved");
}

export async function getEbook(req: Request, res: Response) {
  sendSuccess(res, await progressService.getEbookProgress(req.auth!.userId, req.params["id"]!), "eBook progress");
}
export async function putEbook(req: Request, res: Response) {
  sendSuccess(res, await progressService.saveEbookProgress(req.auth!.userId, req.params["id"]!, req.body), "Progress saved");
}

export async function getAudiobook(req: Request, res: Response) {
  sendSuccess(res, await progressService.getAudiobookProgress(req.auth!.userId, req.params["id"]!), "Audiobook progress");
}
export async function putAudiobook(req: Request, res: Response) {
  sendSuccess(res, await progressService.saveAudiobookProgress(req.auth!.userId, req.params["id"]!, req.body), "Progress saved");
}

export async function continueActivity(req: Request, res: Response) {
  sendSuccess(res, await progressService.getContinue(req.auth!.userId), "Continue");
}
