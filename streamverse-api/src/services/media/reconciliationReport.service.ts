import { prisma } from "../../config/database";
import { logger } from "../../config/logger";
import { getStorageProvider } from "../storage";
import { hlsRoot } from "./storageKey.service";

/**
 * READ-ONLY storage/database reconciliation. It reports; it never deletes an object, never changes a row's status and never
 * writes to the database at all. (The destructive cleanup in mediaCleanup.service.ts and the MISSING-marking in
 * reconciliation.service.ts stay unscheduled in production until their deletion rules are signed off.)
 *
 * Each run looks at a bounded slice so a large bucket is covered over many runs:
 *  - READY assets whose object is gone from storage (HEAD, one batch per run, rotating through all assets);
 *  - storage objects under the app's prefixes that no asset row accounts for (one listing page per run, rotating);
 *  - FAILED processing, uploads that expired before finishing, PROCESSING stuck for hours, DELETED rows waiting for cleanup.
 */
const ASSET_BATCH = 200;
const LIST_PAGE = 1000;
const STUCK_PROCESSING_MS = 6 * 60 * 60 * 1000;
const PREFIXES = ["content/", "media/", "banners/"];

export interface ReconciliationReport {
  readyChecked: number;
  readyMissingInStorage: string[];
  objectsListed: number;
  unattachedObjects: string[];
  failedProcessing: number;
  expiredUploads: number;
  stuckProcessing: number;
  deletedAwaitingCleanup: number;
}

// cursors kept in memory: a restart simply starts again from the beginning, which is harmless
let assetCursor: string | undefined;
let prefixIndex = 0;
let listToken: string | undefined;

export async function reconciliationReport(): Promise<ReconciliationReport> {
  const storage = getStorageProvider();
  const now = new Date();

  // 1. READY assets whose object has vanished (a storage error is not evidence of absence)
  const assets = await prisma.mediaAsset.findMany({
    where: { status: "READY", storageKey: { not: null }, ...(assetCursor ? { id: { gt: assetCursor } } : {}) },
    select: { id: true, storageKey: true },
    orderBy: { id: "asc" },
    take: ASSET_BATCH,
  });
  assetCursor = assets.length === ASSET_BATCH ? assets.at(-1)!.id : undefined;
  const readyMissingInStorage: string[] = [];
  for (const a of assets) {
    const exists = await storage.objectExists(a.storageKey!).catch(() => true);
    if (!exists) readyMissingInStorage.push(a.id);
  }

  // 2. objects no asset row accounts for (HLS output lives under its master's hls folder, so it is attributed to the master)
  const prefix = PREFIXES[prefixIndex]!;
  const page = await storage.listObjects(prefix, LIST_PAGE, listToken).catch(() => ({ objects: [], nextToken: undefined }));
  listToken = page.nextToken;
  if (!listToken) prefixIndex = (prefixIndex + 1) % PREFIXES.length;
  const keys = page.objects.map((o) => o.key);
  const known = new Set(
    keys.length ? (await prisma.mediaAsset.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } })).map((r) => r.storageKey!) : [],
  );
  const hlsFolders = new Set(
    (await prisma.mediaAsset.findMany({ where: { type: "MOVIE_MASTER", storageKey: { not: null } }, select: { storageKey: true } })).map((r) => hlsRoot(r.storageKey!) + "/"),
  );
  const unattachedObjects = keys.filter((k) => !known.has(k) && ![...hlsFolders].some((f) => k.startsWith(f)));

  // 3. state that needs a person's attention
  const [failedProcessing, expiredUploads, stuckProcessing, deletedAwaitingCleanup] = await Promise.all([
    prisma.mediaAsset.count({ where: { status: "FAILED", deletedAt: null } }),
    prisma.mediaAsset.count({ where: { status: { in: ["PENDING", "UPLOADING"] }, expiresAt: { lt: now } } }),
    prisma.mediaAsset.count({ where: { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STUCK_PROCESSING_MS) } } }),
    prisma.mediaAsset.count({ where: { status: "DELETED" } }),
  ]);

  return { readyChecked: assets.length, readyMissingInStorage, objectsListed: keys.length, unattachedObjects, failedProcessing, expiredUploads, stuckProcessing, deletedAwaitingCleanup };
}

/** Runs one report and logs it: a warning (with a few sample ids/keys) when something needs attention, otherwise info. */
export async function logReconciliationReport(): Promise<void> {
  const r = await reconciliationReport();
  const summary = {
    readyChecked: r.readyChecked,
    readyMissingInStorage: r.readyMissingInStorage.length,
    objectsListed: r.objectsListed,
    unattachedObjects: r.unattachedObjects.length,
    failedProcessing: r.failedProcessing,
    expiredUploads: r.expiredUploads,
    stuckProcessing: r.stuckProcessing,
    deletedAwaitingCleanup: r.deletedAwaitingCleanup,
  };
  const attention = r.readyMissingInStorage.length + r.unattachedObjects.length + r.stuckProcessing;
  if (attention > 0) {
    logger.warn({ ...summary, sampleMissingAssetIds: r.readyMissingInStorage.slice(0, 10), sampleUnattachedKeys: r.unattachedObjects.slice(0, 10) }, "media reconciliation (report only): needs attention");
  } else {
    logger.info(summary, "media reconciliation (report only): consistent");
  }
}
