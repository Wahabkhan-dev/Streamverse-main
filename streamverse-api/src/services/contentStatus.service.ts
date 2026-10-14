import type { Content, ContentStatus, ContentType } from "@prisma/client";
import * as contentRepository from "../repositories/content.repository";
import { assertNotStale } from "../utils/concurrency";
import { AppError, NotFoundError } from "../utils/errors";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { assertReadyToPublish } from "./contentPublishValidation.service";

/**
 * Section 58/59: every legal status change, for every content type, goes through here — nothing else
 * decides whether a transition makes sense. ARCHIVED is terminal in this phase (nothing un-archives it);
 * PROCESSING/PROCESSING_FAILED aren't reachable yet (no media pipeline exists before Phase 6), but are
 * listed for completeness.
 */
const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ["PUBLISHED", "SCHEDULED"],
  SCHEDULED: ["PUBLISHED", "DRAFT", "UNPUBLISHED"],
  PUBLISHED: ["UNPUBLISHED", "ARCHIVED"],
  UNPUBLISHED: ["PUBLISHED", "ARCHIVED"],
  ARCHIVED: [],
  PROCESSING: [],
  PROCESSING_FAILED: [],
};

function assertTransition(from: ContentStatus, to: ContentStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new AppError(`Cannot move content from ${from} to ${to}.`, 409, "CONFLICT");
}

async function loadActive(id: string): Promise<Content> {
  const content = await contentRepository.findActiveById(id);
  if (!content) throw new NotFoundError("Content not found");
  return content;
}

export async function publishContent(type: ContentType, id: string, ctx: AuditContext, expectedUpdatedAt?: Date) {
  const content = await loadActive(id);
  assertNotStale(content.updatedAt, expectedUpdatedAt);
  assertTransition(content.status, "PUBLISHED");
  await assertReadyToPublish(type, id);
  const updated = await contentRepository.update(id, { status: "PUBLISHED", publishedAt: new Date(), publishAt: null });
  await recordAudit(ctx, { action: "content.published", entityType: type, entityId: id, metadata: { from: content.status } });
  return updated;
}

export async function unpublishContent(type: ContentType, id: string, ctx: AuditContext, expectedUpdatedAt?: Date) {
  const content = await loadActive(id);
  assertNotStale(content.updatedAt, expectedUpdatedAt);
  assertTransition(content.status, "UNPUBLISHED");
  const updated = await contentRepository.update(id, { status: "UNPUBLISHED", publishAt: null });
  await recordAudit(ctx, { action: "content.unpublished", entityType: type, entityId: id, metadata: { from: content.status } });
  return updated;
}

export async function archiveContent(type: ContentType, id: string, ctx: AuditContext, expectedUpdatedAt?: Date) {
  const content = await loadActive(id);
  assertNotStale(content.updatedAt, expectedUpdatedAt);
  assertTransition(content.status, "ARCHIVED");
  const updated = await contentRepository.update(id, { status: "ARCHIVED" });
  await recordAudit(ctx, { action: "content.archived", entityType: type, entityId: id, metadata: { from: content.status } });
  return updated;
}

export async function scheduleContent(type: ContentType, id: string, publishAt: Date, ctx: AuditContext, expectedUpdatedAt?: Date) {
  const content = await loadActive(id);
  assertNotStale(content.updatedAt, expectedUpdatedAt);
  assertTransition(content.status, "SCHEDULED");
  const updated = await contentRepository.update(id, { status: "SCHEDULED", publishAt });
  await recordAudit(ctx, { action: "content.scheduled", entityType: type, entityId: id, metadata: { publishAt: publishAt.toISOString() } });
  return updated;
}

/**
 * Section 24: a cancelled schedule always returns to DRAFT, not UNPUBLISHED — a scheduled title was
 * never actually published, so "DRAFT" (not yet live) describes it correctly. Documented choice, not
 * left ambiguous.
 */
export async function cancelSchedule(type: ContentType, id: string, ctx: AuditContext, expectedUpdatedAt?: Date) {
  const content = await loadActive(id);
  assertNotStale(content.updatedAt, expectedUpdatedAt);
  assertTransition(content.status, "DRAFT");
  const updated = await contentRepository.update(id, { status: "DRAFT", publishAt: null });
  await recordAudit(ctx, { action: "content.schedule_cancelled", entityType: type, entityId: id });
  return updated;
}

export async function softDeleteContent(type: ContentType, id: string, ctx: AuditContext, expectedUpdatedAt?: Date) {
  const content = await loadActive(id);
  assertNotStale(content.updatedAt, expectedUpdatedAt);
  const updated = await contentRepository.softDelete(id);
  await recordAudit(ctx, { action: "content.deleted", entityType: type, entityId: id, metadata: { from: content.status } });
  return updated;
}
