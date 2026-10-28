import { prisma } from "../config/database";
import * as analyticsRepository from "../repositories/analytics.repository";
import { buildPagination } from "../utils/pagination";
import type { CreateAnnouncementInput } from "../validators/announcement.validator";
import { recordAudit, type AuditContext } from "./auditLog.service";

const BATCH = 1000;
const ACTION = "announcement.sent";

/**
 * Sends one announcement to every ACTIVE customer: a Notification row each (what the bell and the Notifications page read),
 * written in batches so a large customer base never builds one giant statement. Returns how many people it reached.
 */
export async function sendAnnouncement(input: CreateAnnouncementInput, ctx: AuditContext) {
  let recipients = 0;
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE", role: "USER" },
      select: { id: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!users.length) break;
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type: input.kind, title: input.title, message: input.message || "From the StreamVerse team", metadata: { announcement: true } })),
    });
    recipients += users.length;
    cursor = users[users.length - 1]!.id;
    if (users.length < BATCH) break;
  }
  await recordAudit(ctx, { action: ACTION, entityType: "ANNOUNCEMENT", metadata: { title: input.title, kind: input.kind, recipients } });
  return { recipients };
}

/** The most recent announcements (from the audit trail), newest first. */
export async function recentAnnouncements(page: number, limit: number) {
  const { rows, total } = await analyticsRepository.listAuditLogs({ action: ACTION }, (page - 1) * limit, limit);
  return {
    rows: rows.map((r) => ({ id: r.id, ...(r.metadata as { title?: string; kind?: string; recipients?: number } | null), createdAt: r.createdAt })),
    pagination: buildPagination(total, page, limit),
  };
}
