import type { Request, Response } from "express";
import * as notificationService from "../services/notification.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response) {
  const { page, limit, unreadOnly } = req.query as unknown as { page: number; limit: number; unreadOnly?: boolean };
  const { rows, pagination, unreadCount } = await notificationService.listNotifications(req.auth!.userId, !!unreadOnly, page, limit);
  // Section 51: unread count travels alongside the page — not the standard `sendPaginated` shape, so built directly.
  res.status(200).json({ success: true, message: "Notifications", data: rows, pagination, unreadCount });
}
export async function markRead(req: Request, res: Response) {
  sendSuccess(res, await notificationService.markRead(req.auth!.userId, req.params["id"]!), "Marked read");
}
export async function markAllRead(req: Request, res: Response) {
  await notificationService.markAllRead(req.auth!.userId);
  sendSuccess(res, null, "All marked read");
}
export async function remove(req: Request, res: Response) {
  await notificationService.removeNotification(req.auth!.userId, req.params["id"]!);
  sendSuccess(res, null, "Notification deleted");
}
