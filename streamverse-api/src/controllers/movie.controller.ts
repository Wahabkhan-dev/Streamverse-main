import type { Request, Response } from "express";
import * as movieService from "../services/movie.service";
import * as contentStatusService from "../services/contentStatus.service";
import { toMovieAdminDto } from "../mappers/movie.mapper";
import { mapContentListRow } from "../mappers/content.mapper";
import { signCoversByContentId } from "../services/catalog.service";
import { auditContext } from "../services/auditLog.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";
import type { movieListQuerySchema } from "../validators/movie.validator";
import type { z } from "zod";

export async function create(req: Request, res: Response) {
  const { content, movie } = await movieService.createMovie(req.body, auditContext(req));
  const full = await movieService.getFullMovie(content.id);
  void movie;
  sendSuccess(res, toMovieAdminDto(full), "Movie created", 201);
}

export async function update(req: Request, res: Response) {
  const full = await movieService.updateMovie(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, toMovieAdminDto(full), "Movie updated");
}

export async function getOne(req: Request, res: Response) {
  const full = await movieService.getFullMovie(req.params["id"]!);
  sendSuccess(res, toMovieAdminDto(full), "Movie");
}

export async function list(req: Request, res: Response) {
  const { rows, pagination } = await movieService.listMovies(req.query as unknown as z.infer<typeof movieListQuerySchema>);
  const covers = await signCoversByContentId(rows.map((r) => r.id), "MOVIE");
  sendPaginated(res, rows.map((r) => mapContentListRow(r, covers.get(r.id) ?? null)), pagination);
}

export async function remove(req: Request, res: Response) {
  await contentStatusService.softDeleteContent("MOVIE", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, null, "Movie deleted");
}

export async function publish(req: Request, res: Response) {
  const content = await contentStatusService.publishContent("MOVIE", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Movie published");
}
export async function unpublish(req: Request, res: Response) {
  const content = await contentStatusService.unpublishContent("MOVIE", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Movie unpublished");
}
export async function archive(req: Request, res: Response) {
  const content = await contentStatusService.archiveContent("MOVIE", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Movie archived");
}
export async function schedule(req: Request, res: Response) {
  const content = await contentStatusService.scheduleContent("MOVIE", req.params["id"]!, req.body.publishAt, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Movie scheduled");
}
export async function cancelSchedule(req: Request, res: Response) {
  const content = await contentStatusService.cancelSchedule("MOVIE", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Schedule cancelled");
}
