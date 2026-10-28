import type { MediaAsset, MediaAssetType, Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/errors";
import { KIND, PURPOSE_RULES, isPublicPurpose, type UploadKind } from "../constants/upload";
import * as library from "../repositories/mediaLibrary.repository";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../utils/errors";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { ASSET_SLOTS, allUsedAssetIds, assetIdsOwnedBy, findUsage, moveReferences, type AssetUsage, type UsageKind } from "./media/assetSlots";
import { hlsRoot } from "./media/storageKey.service";
import { processingProgressOf } from "./media/processingProgress";
import { signStorageKey } from "./assetUrl.service";
import { getStorageProvider } from "./storage";
import type { LibraryListQuery, UpdateMediaMetadataInput } from "../validators/mediaLibrary.validator";

export type MediaCategory = "images" | "videos" | "audio" | "documents";

const CATEGORY_OF_KIND: Record<UploadKind, MediaCategory> = { [KIND.IMAGE]: "images", [KIND.VIDEO]: "videos", [KIND.AUDIO]: "audio", [KIND.EBOOK]: "documents", [KIND.CAPTION]: "documents" };
export const categoryOf = (type: MediaAssetType): MediaCategory => CATEGORY_OF_KIND[PURPOSE_RULES[type].kind];
const typesIn = (category: MediaCategory): MediaAssetType[] => (Object.keys(PURPOSE_RULES) as MediaAssetType[]).filter((t) => categoryOf(t) === category);

/** Streaming/reading/listening files stay private: they only ever get a short-lived admin preview link, never a public URL. */
const isPrivateType = (type: MediaAssetType) => !isPublicPurpose(type);
const ADMIN_PREVIEW_TTL_SECONDS = 300;

const SORTS: Record<LibraryListQuery["sort"], Prisma.MediaAssetOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }],
  oldest: [{ createdAt: "asc" }],
  name: [{ originalFileName: "asc" }],
  size: [{ sizeBytes: "desc" }],
  type: [{ type: "asc" }],
};

const USAGE_FILTERS: Record<string, UsageKind[]> = { movies: ["MOVIE"], ebooks: ["EBOOK"], audiobooks: ["AUDIOBOOK"], banners: ["BANNER"], collections: ["COLLECTION"], homepage: ["BANNER", "COLLECTION"] };

/** Turns the URL-state filters into one Prisma `where`. Attachment/search filters resolve to id sets first (a handful of queries, not one per row). */
async function buildWhere(q: LibraryListQuery): Promise<Prisma.MediaAssetWhereInput> {
  const and: Prisma.MediaAssetWhereInput[] = [library.LIBRARY_BASE];

  if (q.category) and.push({ type: { in: typesIn(q.category) } });
  if (q.assetRole) and.push({ type: q.assetRole as MediaAssetType });
  if (q.status) and.push({ status: q.status });

  if (q.attachedType === "unattached") and.push({ id: { notIn: [...(await allUsedAssetIds())] } });
  else if (q.attachedType) and.push({ id: { in: [...(await allUsedAssetIds(USAGE_FILTERS[q.attachedType]))] } });

  if (q.search) {
    const text = q.search.trim();
    const contentIds = (await library.contentsMatching(text)).map((c) => c.id);
    const owned = contentIds.length ? [...(await assetIdsOwnedBy(contentIds))] : [];
    const normalized = text.toUpperCase().replace(/[\s-]+/g, "_");
    const matchingTypes = (Object.keys(PURPOSE_RULES) as MediaAssetType[]).filter((t) => normalized.length >= 3 && t.includes(normalized));
    const or: Prisma.MediaAssetWhereInput[] = [{ originalFileName: { contains: text } }, { displayTitle: { contains: text } }, { altText: { contains: text } }];
    if (contentIds.length) or.push({ contentId: { in: contentIds } });
    if (owned.length) or.push({ id: { in: owned } });
    if (matchingTypes.length) or.push({ type: { in: matchingTypes } });
    and.push({ OR: or });
  }
  return { AND: and };
}

const usageSummary = (usages: AssetUsage[]) => usages.slice(0, 3).map((u) => ({ kind: u.kind, role: u.role, title: u.title, code: u.code, href: u.href }));

/** Compact row for grid/list. No storage key, no signed URL for anything but image thumbnails, no per-row queries. */
async function toListItem(a: MediaAsset, usages: AssetUsage[], uploaders: Map<string, string>) {
  const category = categoryOf(a.type);
  return {
    id: a.id,
    type: a.type,
    category,
    status: a.status,
    progress: processingProgressOf(a),
    fileName: a.originalFileName,
    displayTitle: a.displayTitle ?? null,
    altText: a.altText ?? null,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    durationSeconds: a.durationSeconds,
    folder: a.folder ?? null,
    createdAt: a.createdAt,
    uploadedBy: a.createdById ? (uploaders.get(a.createdById) ?? null) : null,
    usageCount: usages.length,
    usedBy: usageSummary(usages),
    thumbnailUrl: category === "images" && a.status === "READY" ? await signStorageKey(a.storageKey) : null,
  };
}

export async function listMedia(q: LibraryListQuery) {
  const where = await buildWhere(q);
  const [total, rows] = await Promise.all([library.count(where), library.findPage(where, SORTS[q.sort], (q.page - 1) * q.limit, q.limit)]);
  const ids = rows.map((r) => r.id);
  const [usage, users] = await Promise.all([findUsage(ids, new Set(rows.map((r) => r.type))), library.usersByIds([...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v))])]);
  const uploaders = new Map(users.map((u) => [u.id, u.fullName]));
  const items = await Promise.all(rows.map((r) => toListItem(r, usage.get(r.id) ?? [], uploaders)));
  return { items, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

/** Counters and storage used, from one GROUP BY (never by loading rows). */
export async function mediaStats() {
  const groups = await library.groupByTypeAndStatus();
  const stats = { total: 0, storageBytes: 0, byCategory: { images: 0, videos: 0, audio: 0, documents: 0 } as Record<MediaCategory, number>, byStatus: {} as Record<string, number>, bytesByCategory: { images: 0, videos: 0, audio: 0, documents: 0 } as Record<MediaCategory, number> };
  for (const g of groups) {
    const n = g._count._all;
    const bytes = g._sum.sizeBytes ?? 0;
    const cat = categoryOf(g.type);
    stats.total += n;
    stats.storageBytes += bytes;
    stats.byCategory[cat] += n;
    stats.bytesByCategory[cat] += bytes;
    stats.byStatus[g.status] = (stats.byStatus[g.status] ?? 0) + n;
  }
  // count only live library files that are wired into a slot (a deleted file or a rendition can still be referenced)
  const usedIds = [...(await allUsedAssetIds())];
  const attached = usedIds.length ? await library.count({ AND: [library.LIBRARY_BASE, { id: { in: usedIds } }] }) : 0;
  return { ...stats, attached, unattached: Math.max(0, stats.total - attached) };
}

export async function getMedia(id: string) {
  const a = await library.findDetail(id);
  if (!a) throw new NotFoundError("Media asset not found");
  const [usage, renditions, users] = await Promise.all([findUsage([id]), library.findRenditions(id), library.usersByIds(a.createdById ? [a.createdById] : [])]);
  const category = categoryOf(a.type);
  const privateType = isPrivateType(a.type);
  const ready = a.status === "READY" && !!a.storageKey;
  // A short-lived admin preview link, generated now and never stored. Protected media is previewed this way and nowhere else.
  const previewUrl = ready && a.storageKey ? await getStorageProvider().createDownloadUrl(a.storageKey, ADMIN_PREVIEW_TTL_SECONDS) : null;
  return {
    id: a.id,
    type: a.type,
    category,
    status: a.status,
    processingError: a.status === "FAILED" ? a.processingError : null,
    progress: processingProgressOf(a),
    fileName: a.originalFileName,
    displayTitle: a.displayTitle ?? null,
    altText: a.altText ?? null,
    caption: a.caption ?? null,
    notes: a.notes ?? null,
    folder: a.folder ?? null,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    durationSeconds: a.durationSeconds,
    checksum: a.checksum,
    objectKey: a.storageKey,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    uploadedBy: a.createdById ? (users[0]?.fullName ?? null) : null,
    protected: privateType,
    previewUrl,
    previewKind: category === "images" ? "image" : category === "videos" ? "video" : category === "audio" ? "audio" : a.mimeType === "application/pdf" ? "pdf" : "file",
    previewExpiresInSeconds: previewUrl ? ADMIN_PREVIEW_TTL_SECONDS : null,
    /** Only configured-public images expose a stable URL; everything else is private and only previewable by an admin. */
    publicUrl: !privateType && env.MEDIA_BASE_URL && a.storageKey ? getStorageProvider().getPublicUrl(a.storageKey) : null,
    usedBy: usage.get(id) ?? [],
    renditions: renditions.map((r) => ({ id: r.id, variant: r.variant, resolution: r.resolution, status: r.status, sizeBytes: r.sizeBytes })),
  };
}

export async function updateMetadata(id: string, input: UpdateMediaMetadataInput, ctx: AuditContext) {
  const a = await library.findDetail(id);
  if (!a) throw new NotFoundError("Media asset not found");
  const data: Prisma.MediaAssetUncheckedUpdateInput = {};
  for (const key of ["displayTitle", "altText", "caption", "notes", "folder"] as const) {
    if (input[key] !== undefined) data[key] = input[key] === "" ? null : input[key];
  }
  if (Object.keys(data).length) await library.updateMetadata(id, data);
  await recordAudit(ctx, { action: "media.updated", entityType: "MEDIA_ASSET", entityId: id, metadata: { fields: Object.keys(data) } });
  return getMedia(id);
}

const usageLines = (usages: AssetUsage[]) => usages.map((u) => ({ path: "usedBy", message: `${u.kind === "MOVIE" ? "Movie" : u.kind === "EBOOK" ? "eBook" : u.kind === "AUDIOBOOK" ? "Audiobook" : u.kind === "BANNER" ? "Banner" : "Collection"}: ${u.title}${u.code ? ` (${u.code})` : ""} - ${u.role}` }));

/** Removes the object and everything derived from it (HLS renditions). Throws if storage refuses - the caller must not touch the DB then. */
async function deleteStoredObjects(asset: MediaAsset): Promise<void> {
  const storage = getStorageProvider();
  if (asset.storageKey) {
    await storage.deleteObject(asset.storageKey);
    if (asset.type === "MOVIE_MASTER") {
      const prefix = `${hlsRoot(asset.storageKey)}/`;
      let token: string | undefined;
      do {
        const page = await storage.listObjects(prefix, 500, token);
        for (const o of page.objects) await storage.deleteObject(o.key);
        token = page.nextToken;
      } while (token);
    }
  }
}

export async function deleteMedia(id: string, ctx: AuditContext): Promise<void> {
  const a = await library.findDetail(id);
  if (!a) throw new NotFoundError("Media asset not found");
  const usages = (await findUsage([id])).get(id) ?? [];
  if (usages.length) throw new AppError(`This file is currently used by ${usages.length} item${usages.length === 1 ? "" : "s"} and cannot be deleted. Detach or replace it first.`, 409, ERROR_CODES.MEDIA_IN_USE, usageLines(usages));

  // Row first: removing a big file and its renditions from storage can take long, and if the request is dropped half way the
  // file must not stay listed with nothing behind it. The row is hidden at once; if storage refuses, the cleanup job
  // (status DELETED past its grace period) removes the leftover object later.
  await mediaAssetRepository.softDelete(id);
  await recordAudit(ctx, { action: "media.deleted", entityType: "MEDIA_ASSET", entityId: id, metadata: { type: a.type } });
  try {
    await deleteStoredObjects(a);
  } catch (err) {
    logger.error({ assetId: id, err }, "media library: storage delete failed after the row was hidden; the cleanup job will retry");
  }
}

export async function bulkDelete(ids: string[], ctx: AuditContext) {
  const results: Array<{ id: string; deleted: boolean; reason?: string }> = [];
  for (const id of ids) {
    try {
      await deleteMedia(id, ctx);
      results.push({ id, deleted: true });
    } catch (err) {
      results.push({ id, deleted: false, reason: err instanceof Error ? err.message : "Failed" });
    }
  }
  return { results, deleted: results.filter((r) => r.deleted).length, blocked: results.filter((r) => !r.deleted).length };
}

/**
 * Swaps `id` for an already-uploaded, READY replacement in EVERY slot that used it, in one transaction, so Movies, Dashboard,
 * Homepage, Catalog, Search, Collections, My List, Library and History all see the new file at once. The new file is verified
 * first; the old one is retired (soft-deleted for the cleanup job) only after the swap committed - never deleted first.
 */
export async function replaceMedia(id: string, newAssetId: string, ctx: AuditContext) {
  if (id === newAssetId) throw new ValidationError([{ path: "newAssetId", message: "Choose a different file to replace this one." }]);
  const [old, next] = await Promise.all([library.findDetail(id), library.findDetail(newAssetId)]);
  if (!old) throw new NotFoundError("Media asset not found");
  if (!next) throw new ValidationError([{ path: "newAssetId", message: "The replacement file does not exist." }]);
  if (next.status !== "READY") throw new ValidationError([{ path: "newAssetId", message: `The replacement is not ready yet (status: ${next.status}).` }]);
  if (categoryOf(old.type) !== categoryOf(next.type)) throw new ValidationError([{ path: "newAssetId", message: `A ${categoryOf(old.type)} file can only be replaced by another ${categoryOf(old.type)} file.` }]);

  const usages = (await findUsage([id])).get(id) ?? [];
  const slotsInUse = ASSET_SLOTS.filter((s) => usages.some((u) => u.role === s.role && u.kind === s.kind));
  for (const s of slotsInUse) {
    const sameType = next.type === old.type;
    const libraryFillsArtwork = next.type === "LIBRARY_IMAGE" && s.shareable;
    if (!sameType && !libraryFillsArtwork) throw new ValidationError([{ path: "newAssetId", message: `The replacement must be a ${old.type} file to fit "${s.role}".` }]);
    const min = PURPOSE_RULES[s.types[0]!]?.minDimensions;
    if (min && next.width && next.height && (next.width < min.width || next.height < min.height)) {
      throw new ValidationError([{ path: "newAssetId", message: `"${s.role}" needs at least ${min.width}x${min.height}px; the replacement is ${next.width}x${next.height}px.` }]);
    }
  }
  const moved = await prisma.$transaction((tx) => moveReferences(tx, id, newAssetId));
  // The old file is retired only now that nothing points at it any more; the cleanup job removes the object after the grace period.
  await mediaAssetRepository.softDelete(id);
  await recordAudit(ctx, { action: "media.replaced", entityType: "MEDIA_ASSET", entityId: id, metadata: { newAssetId, references: moved } });
  return { replacedAssetId: id, newAssetId, referencesMoved: moved, asset: await getMedia(newAssetId) };
}

// --- reconciliation (report only) ---------------------------------------------------------------------------------

export interface ReconcileReport {
  checked: number;
  missing: Array<{ id: string; fileName: string | null; type: MediaAssetType; used: boolean }>;
  orphans: Array<{ key: string; sizeBytes: number }>;
  orphanScan: { scannedKeys: number; truncated: boolean };
  failed: number;
  stuckUploads: number;
}

const ORPHAN_PREFIXES = ["media/", "content/", "banners/"];

/**
 * Compares the database with the bucket. It only REPORTS - nothing is deleted or changed except each checked row's `checkedAt`
 * cursor. The DB side is checked in bounded batches (HEAD per asset), the bucket side in bounded listing pages, so one call is
 * always cheap no matter how large the library is; call again to continue.
 */
export async function reconcile(opts: { batch: number; scanBucket: boolean; scanLimit: number }): Promise<ReconcileReport> {
  const storage = getStorageProvider();
  const rows = await library.nextToVerify(opts.batch);
  const missingRows: MediaAsset[] = [];
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: Math.min(8, queue.length) }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        const head = await storage.headObject(row.storageKey!).catch(() => ({ exists: true }));
        if (!head.exists) missingRows.push(row);
      }
    }),
  );
  await library.markChecked(rows.map((r) => r.id));
  const usage = await findUsage(missingRows.map((r) => r.id));

  const orphans: ReconcileReport["orphans"] = [];
  let scanned = 0;
  let truncated = false;
  if (opts.scanBucket) {
    for (const prefix of ORPHAN_PREFIXES) {
      if (scanned >= opts.scanLimit) {
        truncated = true;
        break;
      }
      const page = await storage.listObjects(prefix, Math.min(1000, opts.scanLimit - scanned));
      scanned += page.objects.length;
      if (page.nextToken) truncated = true;
      // renditions and HLS segments are derived files owned by their master; only top-level source objects can be orphans
      const candidates = page.objects.filter((o) => !o.key.includes("/hls/"));
      const known = new Set(await library.existingKeys(candidates.map((o) => o.key)));
      for (const o of candidates) if (!known.has(o.key)) orphans.push({ key: o.key, sizeBytes: o.sizeBytes });
    }
  }

  const [failed, stuckUploads] = await Promise.all([
    library.count({ AND: [library.LIBRARY_BASE, { status: "FAILED" }] }),
    library.count({ AND: [library.LIBRARY_BASE, { status: { in: ["PENDING", "UPLOADING"] } }, { expiresAt: { lt: new Date() } }] }),
  ]);
  return {
    checked: rows.length,
    missing: missingRows.map((r) => ({ id: r.id, fileName: r.originalFileName, type: r.type, used: (usage.get(r.id) ?? []).length > 0 })),
    orphans,
    orphanScan: { scannedKeys: scanned, truncated },
    failed,
    stuckUploads,
  };
}
