import type { LegalDocType } from "@prisma/client";
import * as legalRepository from "../repositories/legal.repository";
import type { LegalVersionMetadataInput } from "../validators/legal.validator";
import { NotFoundError, ValidationError } from "../utils/errors";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

const SLUGS: Record<LegalDocType, { title: string; slug: string }> = {
  PRIVACY_POLICY: { title: "Privacy Policy", slug: "privacy-policy" },
  TERMS_AND_CONDITIONS: { title: "Terms & Conditions", slug: "terms-and-conditions" },
  REFUND_POLICY: { title: "Refund Policy", slug: "refund-policy" },
};

/** Idempotent — safe to call from the seed every run (used for the three fixed document types). */
export async function ensureDocument(type: LegalDocType) {
  const existing = await legalRepository.findByType(type);
  if (existing) return existing;
  const { title, slug } = SLUGS[type];
  await legalRepository.createDocument(type, title, slug);
  return legalRepository.findByType(type);
}

export const getDocument = legalRepository.findByType;
export const listVersions = legalRepository.listVersionsForType;

/**
 * Saves a draft without touching what is currently published (Section 36/40): if a draft row already
 * exists it is updated in place; otherwise a new DRAFT version is created and pointed at. Either way,
 * `currentPublishedVersion` is untouched until `publishDraft` runs.
 */
export async function saveDraft(type: LegalDocType, input: LegalVersionMetadataInput, ctx: AuditContext = NO_ACTOR) {
  const doc = await legalRepository.findByType(type);
  if (!doc) throw new NotFoundError(`No legal document is configured for ${type}`);

  const version = await legalRepository.runInTransaction(async (tx) => {
    if (doc.currentDraftVersionId) return legalRepository.updateVersion(tx, doc.currentDraftVersionId, { ...input, status: "DRAFT" });
    const version = await legalRepository.createVersion(tx, doc.id, { ...input, status: "DRAFT", createdById: ctx.userId });
    await legalRepository.setDraftPointer(tx, doc.id, version.id);
    return version;
  });
  await recordAudit(ctx, { action: "legal.draft_saved", entityType: "LEGAL_DOCUMENT", entityId: doc.id, metadata: { type, version: input.version } });
  return version;
}

/**
 * Makes the current draft the published version. The version row that was published before is left
 * exactly as it was (still in `versions`, just no longer the "current" one) — nothing is overwritten.
 */
export async function publishDraft(type: LegalDocType, ctx: AuditContext = NO_ACTOR) {
  const doc = await legalRepository.findByType(type);
  if (!doc) throw new NotFoundError(`No legal document is configured for ${type}`);
  if (!doc.currentDraftVersionId) throw new NotFoundError("There is no draft to publish.");

  // Section 72: never publish an empty document, even though saveDraft's own validation should already
  // guarantee this for anything that reached the database through it.
  const draft = doc.currentDraftVersion!;
  const problems = [
    !draft.title.trim() && { path: "title", message: "Title is required." },
    !draft.content.trim() && { path: "content", message: "Content is required." },
    !draft.version.trim() && { path: "version", message: "Version is required." },
  ].filter((p): p is { path: string; message: string } => !!p);
  if (problems.length) throw new ValidationError(problems, "This draft cannot be published yet.");

  const published = await legalRepository.runInTransaction(async (tx) => {
    const published = await legalRepository.updateVersion(tx, doc.currentDraftVersionId!, { status: "PUBLISHED", publishedAt: new Date() });
    await legalRepository.setPublishedPointer(tx, doc.id, published.id);
    await legalRepository.setDraftPointer(tx, doc.id, null);
    return published;
  });
  await recordAudit(ctx, { action: "legal.published", entityType: "LEGAL_DOCUMENT", entityId: doc.id, metadata: { type, version: published.version } });
  return published;
}
