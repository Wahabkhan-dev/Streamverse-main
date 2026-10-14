import type { Request, Response } from "express";
import * as audiobookService from "../services/audiobook.service";
import * as contentStatusService from "../services/contentStatus.service";
import { toAudiobookAdminDto } from "../mappers/audiobook.mapper";
import { mapContentListRow } from "../mappers/content.mapper";
import { auditContext } from "../services/auditLog.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";

export async function create(req: Request, res: Response) {
  const { content } = await audiobookService.createAudiobook(req.body, auditContext(req));
  const full = await audiobookService.getFullAudiobook(content.id);
  sendSuccess(res, toAudiobookAdminDto(full), "Audiobook created", 201);
}

export async function update(req: Request, res: Response) {
  const full = await audiobookService.updateAudiobook(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, toAudiobookAdminDto(full), "Audiobook updated");
}

export async function getOne(req: Request, res: Response) {
  const full = await audiobookService.getFullAudiobook(req.params["id"]!);
  sendSuccess(res, toAudiobookAdminDto(full), "Audiobook");
}

export async function list(req: Request, res: Response) {
  const { rows, pagination } = await audiobookService.listAudiobooks(req.query as never);
  sendPaginated(res, rows.map(mapContentListRow), pagination);
}

export async function remove(req: Request, res: Response) {
  await contentStatusService.softDeleteContent("AUDIOBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, null, "Audiobook deleted");
}

export async function publish(req: Request, res: Response) {
  const content = await contentStatusService.publishContent("AUDIOBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Audiobook published");
}
export async function unpublish(req: Request, res: Response) {
  const content = await contentStatusService.unpublishContent("AUDIOBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Audiobook unpublished");
}
export async function archive(req: Request, res: Response) {
  const content = await contentStatusService.archiveContent("AUDIOBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Audiobook archived");
}
export async function schedule(req: Request, res: Response) {
  const content = await contentStatusService.scheduleContent("AUDIOBOOK", req.params["id"]!, req.body.publishAt, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Audiobook scheduled");
}
export async function cancelSchedule(req: Request, res: Response) {
  const content = await contentStatusService.cancelSchedule("AUDIOBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Schedule cancelled");
}

export async function addEdition(req: Request, res: Response) {
  const edition = await audiobookService.addEdition(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, edition, "Edition added", 201);
}
export async function updateEdition(req: Request, res: Response) {
  const edition = await audiobookService.updateEdition(req.params["id"]!, req.params["editionId"]!, req.body, auditContext(req));
  sendSuccess(res, edition, "Edition updated");
}
export async function deleteEdition(req: Request, res: Response) {
  await audiobookService.deleteEdition(req.params["id"]!, req.params["editionId"]!, auditContext(req));
  sendSuccess(res, null, "Edition deleted");
}

export async function addChapter(req: Request, res: Response) {
  const chapter = await audiobookService.addChapter(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, chapter, "Chapter added", 201);
}
export async function updateChapter(req: Request, res: Response) {
  const chapter = await audiobookService.updateChapter(req.params["id"]!, req.params["chapterId"]!, req.body, auditContext(req));
  sendSuccess(res, chapter, "Chapter updated");
}
export async function deleteChapter(req: Request, res: Response) {
  await audiobookService.deleteChapter(req.params["id"]!, req.params["chapterId"]!, auditContext(req));
  sendSuccess(res, null, "Chapter deleted");
}
export async function reorderChapters(req: Request, res: Response) {
  await audiobookService.reorderChapters(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, null, "Chapters reordered");
}
