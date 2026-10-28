import type { Request, Response } from "express";
import * as announcementService from "../services/announcement.service";
import { auditContext } from "../services/auditLog.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";

export async function send(req: Request, res: Response) {
  sendSuccess(res, await announcementService.sendAnnouncement(req.body, auditContext(req)), "Announcement sent", 201);
}

export async function list(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query["page"] ?? 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query["limit"] ?? 20) || 20));
  const { rows, pagination } = await announcementService.recentAnnouncements(page, limit);
  sendPaginated(res, rows, pagination, "Announcements");
}
