import type { Request, Response } from "express";
import * as ebookService from "../services/ebook.service";
import * as contentStatusService from "../services/contentStatus.service";
import { toEbookAdminDto } from "../mappers/ebook.mapper";
import { mapContentListRow } from "../mappers/content.mapper";
import { auditContext } from "../services/auditLog.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";

export async function create(req: Request, res: Response) {
  const { content } = await ebookService.createEbook(req.body, auditContext(req));
  const full = await ebookService.getFullEbook(content.id);
  sendSuccess(res, toEbookAdminDto(full), "eBook created", 201);
}

export async function update(req: Request, res: Response) {
  const full = await ebookService.updateEbook(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, toEbookAdminDto(full), "eBook updated");
}

export async function getOne(req: Request, res: Response) {
  const full = await ebookService.getFullEbook(req.params["id"]!);
  sendSuccess(res, toEbookAdminDto(full), "eBook");
}

export async function list(req: Request, res: Response) {
  const { rows, pagination } = await ebookService.listEbooks(req.query as never);
  sendPaginated(res, rows.map(mapContentListRow), pagination);
}

export async function remove(req: Request, res: Response) {
  await contentStatusService.softDeleteContent("EBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, null, "eBook deleted");
}

export async function publish(req: Request, res: Response) {
  const content = await contentStatusService.publishContent("EBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "eBook published");
}
export async function unpublish(req: Request, res: Response) {
  const content = await contentStatusService.unpublishContent("EBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "eBook unpublished");
}
export async function archive(req: Request, res: Response) {
  const content = await contentStatusService.archiveContent("EBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "eBook archived");
}
export async function schedule(req: Request, res: Response) {
  const content = await contentStatusService.scheduleContent("EBOOK", req.params["id"]!, req.body.publishAt, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "eBook scheduled");
}
export async function cancelSchedule(req: Request, res: Response) {
  const content = await contentStatusService.cancelSchedule("EBOOK", req.params["id"]!, auditContext(req), req.body?.expectedUpdatedAt);
  sendSuccess(res, content, "Schedule cancelled");
}

export async function addEdition(req: Request, res: Response) {
  const edition = await ebookService.addEdition(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, edition, "Edition added", 201);
}
export async function updateEdition(req: Request, res: Response) {
  const edition = await ebookService.updateEdition(req.params["id"]!, req.params["editionId"]!, req.body, auditContext(req));
  sendSuccess(res, edition, "Edition updated");
}
export async function deleteEdition(req: Request, res: Response) {
  await ebookService.deleteEdition(req.params["id"]!, req.params["editionId"]!, auditContext(req));
  sendSuccess(res, null, "Edition deleted");
}
