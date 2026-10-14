import type { NotificationType, Prisma } from "@prisma/client";
import * as notificationRepository from "../repositories/notification.repository";
import { NotFoundError } from "../utils/errors";
import { buildPagination, toSkipTake } from "../utils/pagination";

/** Phase 7 (Section 69): billing events create notifications through this one function — never ad hoc `prisma.notification.create` calls scattered across billing services. */
export const createNotification = (userId: string, type: NotificationType, title: string, message: string, metadata?: Record<string, unknown>) =>
  notificationRepository.create({ userId, type, title, message, metadata: metadata as Prisma.InputJsonValue | undefined });

/** Section 51: unread count is returned alongside the page, so the frontend doesn't need a second request. */
export async function listNotifications(userId: string, unreadOnly: boolean, page: number, limit: number) {
  const { skip, take } = toSkipTake(page, limit);
  const [rows, total, unreadCount] = await notificationRepository.list(userId, { unreadOnly }, skip, take);
  return { rows, pagination: buildPagination(total, page, limit), unreadCount };
}

/** Section 50: every lookup is scoped by userId — a notification that exists but belongs to someone else 404s, the same as a missing one. */
async function assertOwned(userId: string, notificationId: string) {
  const notification = await notificationRepository.findById(notificationId);
  if (!notification || notification.userId !== userId) throw new NotFoundError("Notification not found");
  return notification;
}

export async function markRead(userId: string, notificationId: string) {
  await assertOwned(userId, notificationId);
  return notificationRepository.markRead(notificationId);
}

export const markAllRead = (userId: string) => notificationRepository.markAllRead(userId);

export async function removeNotification(userId: string, notificationId: string) {
  await assertOwned(userId, notificationId);
  await notificationRepository.remove(notificationId);
}
