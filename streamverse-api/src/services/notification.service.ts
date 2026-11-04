import type { NotificationType, Prisma } from "@prisma/client";
import * as notificationRepository from "../repositories/notification.repository";
import * as userRepository from "../repositories/user.repository";
import { logger } from "../config/logger";
import { getSetting } from "./settings.service";
import { NotFoundError } from "../utils/errors";
import { buildPagination, toSkipTake } from "../utils/pagination";

/** Phase 7 (Section 69): billing events create notifications through this one function — never ad hoc `prisma.notification.create` calls scattered across billing services. */
export async function createNotification(userId: string, type: NotificationType, title: string, message: string, metadata?: Record<string, unknown>) {
  // Admin -> Settings -> "Billing notifications": when it is off, billing events are still processed but the customer gets no bell alert.
  if (type === "SUBSCRIPTION" && (await getSetting("billingNotifications")) === false) return null;
  return notificationRepository.create({ userId, type, title, message, metadata: metadata as Prisma.InputJsonValue | undefined });
}

const CHUNK = 500;
const KIND_LABEL = { MOVIE: "movie", EBOOK: "eBook", AUDIOBOOK: "audiobook" } as const;

/**
 * Admin -> Settings -> "New content alerts": tells every active customer about a title that just went live, in their notification
 * bell. Does nothing while the switch is off. Returns how many customers were alerted.
 */
export async function broadcastNewRelease(content: { id: string; type: keyof typeof KIND_LABEL; title: string; slug: string }): Promise<number> {
  if ((await getSetting("newContentAlerts")) !== true) return 0;
  const ids = await userRepository.listActiveCustomerIds();
  const metadata = { contentId: content.id, type: content.type, slug: content.slug } as Prisma.InputJsonValue;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await notificationRepository.createMany(
      ids.slice(i, i + CHUNK).map((userId) => ({ userId, type: "NEW_RELEASE" as const, title: "New on StreamVerse", message: `${content.title} (${KIND_LABEL[content.type]}) is now available.`, metadata })),
    );
  }
  logger.info({ contentId: content.id, alerted: ids.length }, "notifications: new release broadcast");
  return ids.length;
}

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
