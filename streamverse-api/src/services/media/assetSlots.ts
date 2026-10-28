import type { MediaAssetType, Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { PURPOSE_RULES } from "../../constants/upload";

/**
 * The ONE registry of every place a MediaAsset can be wired into (a "slot"). "Used by", delete protection, safe
 * replace and cleanup all read from this table, so adding a new slot to the schema means adding one line here.
 *
 * Every slot may point at an asset that other slots (of other titles) point at too: reusing an upload is a LINK to the one
 * stored object, never a copy, so storage is used once. "Used by" lists every place; an asset in use cannot be deleted.
 * `shareable` is narrower: it marks ARTWORK slots, the ones that also accept a generic Media Library image.
 */
export type UsageKind = "MOVIE" | "EBOOK" | "AUDIOBOOK" | "BANNER" | "COLLECTION";

type SlotModel = "movie" | "movieCaption" | "movieAudioTrack" | "movieCast" | "ebook" | "ebookEdition" | "audiobook" | "audiobookEdition" | "audiobookChapter" | "collection" | "banner";

export interface AssetSlot {
  model: SlotModel;
  column: string;
  /** column holding the owning title's Content id; null when the row IS the owner (banner, collection) */
  ownerColumn: string | null;
  kind: UsageKind;
  /** human label shown in "Used by", e.g. "Poster" */
  role: string;
  shareable: boolean;
  /** asset types the slot accepts (LIBRARY_IMAGE is additionally accepted by every shareable image slot) */
  types: MediaAssetType[];
}

const slot = (model: SlotModel, column: string, ownerColumn: string | null, kind: UsageKind, role: string, types: MediaAssetType[], shareable: boolean): AssetSlot => ({ model, column, ownerColumn, kind, role, types, shareable });

export const ASSET_SLOTS: readonly AssetSlot[] = [
  slot("movie", "posterAssetId", "contentId", "MOVIE", "Poster", ["POSTER"], true),
  slot("movie", "backdropAssetId", "contentId", "MOVIE", "Backdrop", ["BACKDROP"], true),
  slot("movie", "thumbnailAssetId", "contentId", "MOVIE", "Thumbnail", ["THUMBNAIL"], true),
  slot("movie", "masterAssetId", "contentId", "MOVIE", "Movie file", ["MOVIE_MASTER"], false),
  slot("movie", "trailerAssetId", "contentId", "MOVIE", "Trailer", ["TRAILER"], false),
  slot("movie", "teaserAssetId", "contentId", "MOVIE", "Teaser", ["TEASER"], false),
  slot("movieCaption", "mediaAssetId", "movieId", "MOVIE", "Captions", ["CAPTION"], false),
  slot("movieAudioTrack", "mediaAssetId", "movieId", "MOVIE", "Audio track", ["AUDIO_TRACK"], false),
  slot("movieCast", "imageAssetId", "movieId", "MOVIE", "Cast photo", ["LIBRARY_IMAGE", "NARRATOR_IMAGE"], true),
  slot("ebook", "epubAssetId", "contentId", "EBOOK", "EPUB file", ["EBOOK_EPUB"], false),
  slot("ebook", "pdfAssetId", "contentId", "EBOOK", "PDF file", ["EBOOK_PDF"], false),
  slot("ebook", "sampleAssetId", "contentId", "EBOOK", "Sample", ["EBOOK_SAMPLE"], false),
  slot("ebook", "frontCoverAssetId", "contentId", "EBOOK", "Front cover", ["EBOOK_FRONT_COVER"], true),
  slot("ebook", "backCoverAssetId", "contentId", "EBOOK", "Back cover", ["EBOOK_BACK_COVER"], true),
  slot("ebook", "spineAssetId", "contentId", "EBOOK", "Spine", ["EBOOK_SPINE"], true),
  slot("ebook", "fullWrapAssetId", "contentId", "EBOOK", "Full wrap", ["EBOOK_FULL_WRAP"], true),
  slot("ebook", "thumbnailAssetId", "contentId", "EBOOK", "Thumbnail", ["THUMBNAIL"], true),
  slot("ebookEdition", "epubAssetId", "ebookId", "EBOOK", "Edition EPUB", ["EBOOK_EPUB"], false),
  slot("ebookEdition", "pdfAssetId", "ebookId", "EBOOK", "Edition PDF", ["EBOOK_PDF"], false),
  slot("ebookEdition", "coverAssetId", "ebookId", "EBOOK", "Edition cover", ["EBOOK_FRONT_COVER"], true),
  slot("audiobook", "mainAssetId", "contentId", "AUDIOBOOK", "Audio file", ["AUDIOBOOK_FILE"], false),
  slot("audiobook", "previewAssetId", "contentId", "AUDIOBOOK", "Preview", ["AUDIOBOOK_PREVIEW"], false),
  slot("audiobook", "coverAssetId", "contentId", "AUDIOBOOK", "Cover", ["AUDIOBOOK_COVER"], true),
  slot("audiobook", "thumbnailAssetId", "contentId", "AUDIOBOOK", "Thumbnail", ["THUMBNAIL"], true),
  slot("audiobookEdition", "narratorImageAssetId", "audiobookId", "AUDIOBOOK", "Narrator photo", ["NARRATOR_IMAGE"], true),
  slot("audiobookEdition", "audioAssetId", "audiobookId", "AUDIOBOOK", "Edition audio", ["AUDIOBOOK_FILE"], false),
  slot("audiobookChapter", "audioAssetId", "audiobookId", "AUDIOBOOK", "Chapter audio", ["AUDIOBOOK_CHAPTER"], false),
  slot("collection", "bannerAssetId", null, "COLLECTION", "Collection artwork", ["NORMAL_BANNER", "HERO_BANNER"], true),
  slot("banner", "desktopAssetId", null, "BANNER", "Banner (desktop)", ["NORMAL_BANNER", "HERO_BANNER", "LATEST_RELEASE_BANNER"], true),
  slot("banner", "mobileAssetId", null, "BANNER", "Banner (mobile)", ["MOBILE_BANNER"], true),
];

/** Minimum pixel size an image must have for a slot, from the same table the upload flow validates against. */
export const minDimensionsFor = (types: MediaAssetType[]) => PURPOSE_RULES[types[0]!]?.minDimensions;

export interface AssetUsage {
  kind: UsageKind;
  role: string;
  /** owner's Content id (titles), banner id, or collection id */
  ownerId: string;
  title: string;
  code: string | null;
  slug: string | null;
  /** where in the admin console to go to see/edit the owner */
  href: string;
}

type Delegate = {
  findMany(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<Array<Record<string, string | null>>>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};
const delegate = (client: Prisma.TransactionClient | typeof prisma, model: SlotModel) => (client as unknown as Record<string, Delegate>)[model]!;

const hrefFor = (kind: UsageKind, slug: string | null): string => {
  if (kind === "MOVIE") return `/admin/movies/${slug ?? ""}/edit`;
  if (kind === "EBOOK") return `/admin/ebooks/${slug ?? ""}/edit`;
  if (kind === "AUDIOBOOK") return `/admin/audiobooks/${slug ?? ""}/edit`;
  if (kind === "BANNER") return "/admin/banners";
  return "/admin/collections";
};

const groupByModel = (slots: readonly AssetSlot[]) => {
  const m = new Map<SlotModel, AssetSlot[]>();
  for (const s of slots) m.set(s.model, [...(m.get(s.model) ?? []), s]);
  return m;
};

/**
 * One query per MODEL (not per column): selects every column of that model that could match, then attributes each match to
 * its slot in memory. `match` is the Prisma filter applied to each column (OR-ed together).
 */
async function scanModels(slots: readonly AssetSlot[], match: { in: string[] } | { not: null }): Promise<Array<{ slot: AssetSlot; value: string; row: Record<string, string | null> }>> {
  const wanted = "in" in match ? new Set(match.in) : null;
  const out = await Promise.all(
    [...groupByModel(slots)].map(async ([model, group]) => {
      const select: Record<string, boolean> = {};
      for (const s of group) {
        select[s.column] = true;
        select[s.ownerColumn ?? "id"] = true;
      }
      const rows = await delegate(prisma, model).findMany({ where: { OR: group.map((s) => ({ [s.column]: match })) }, select });
      return rows.flatMap((row) => group.flatMap((slot) => (row[slot.column] && (!wanted || wanted.has(row[slot.column]!)) ? [{ slot, value: row[slot.column]!, row }] : [])));
    }),
  );
  return out.flat();
}

/**
 * Where is each of these assets used? A fixed number of queries per call regardless of how many assets there are
 * (one per slot, run in parallel, plus one each to resolve owner names) — never one query per asset.
 * `onlyTypes` skips slots that can never hold the given asset types, which keeps a typical page well under the maximum.
 */
export async function findUsage(assetIds: string[], onlyTypes?: Set<MediaAssetType>): Promise<Map<string, AssetUsage[]>> {
  const result = new Map<string, AssetUsage[]>(assetIds.map((id) => [id, []]));
  if (!assetIds.length) return result;
  const slots = ASSET_SLOTS.filter((s) => !onlyTypes || s.types.some((t) => onlyTypes.has(t)) || (s.shareable && onlyTypes.has("LIBRARY_IMAGE")));

  const hits = (await scanModels(slots, { in: assetIds })).flatMap(({ slot, value, row }) => ({ slot, assetId: value, ownerId: (slot.ownerColumn ? row[slot.ownerColumn] : row["id"])! }));
  if (!hits.length) return result;

  const contentIds = [...new Set(hits.filter((h) => h.slot.ownerColumn).map((h) => h.ownerId))];
  const bannerIds = [...new Set(hits.filter((h) => h.slot.kind === "BANNER").map((h) => h.ownerId))];
  const collectionIds = [...new Set(hits.filter((h) => h.slot.kind === "COLLECTION").map((h) => h.ownerId))];
  const [contents, banners, collections] = await Promise.all([
    contentIds.length ? prisma.content.findMany({ where: { id: { in: contentIds } }, select: { id: true, title: true, contentCode: true, slug: true, deletedAt: true } }) : [],
    bannerIds.length ? prisma.banner.findMany({ where: { id: { in: bannerIds } }, select: { id: true, title: true } }) : [],
    collectionIds.length ? prisma.collection.findMany({ where: { id: { in: collectionIds } }, select: { id: true, name: true, slug: true } }) : [],
  ]);
  const contentById = new Map(contents.map((c) => [c.id, c]));
  const bannerById = new Map(banners.map((b) => [b.id, b]));
  const collectionById = new Map(collections.map((c) => [c.id, c]));

  for (const h of hits) {
    // a title that was deleted no longer shows or protects its files (the row is kept, the title is gone)
    if (h.slot.ownerColumn && (contentById.get(h.ownerId)?.deletedAt ?? null) !== null) continue;
    let usage: AssetUsage;
    if (h.slot.kind === "BANNER") {
      const b = bannerById.get(h.ownerId);
      usage = { kind: "BANNER", role: h.slot.role, ownerId: h.ownerId, title: b?.title ?? "Banner", code: null, slug: null, href: hrefFor("BANNER", null) };
    } else if (h.slot.kind === "COLLECTION") {
      const c = collectionById.get(h.ownerId);
      usage = { kind: "COLLECTION", role: h.slot.role, ownerId: h.ownerId, title: c?.name ?? "Collection", code: null, slug: c?.slug ?? null, href: hrefFor("COLLECTION", null) };
    } else {
      const c = contentById.get(h.ownerId);
      usage = { kind: h.slot.kind, role: h.slot.role, ownerId: h.ownerId, title: c?.title ?? "Untitled", code: c?.contentCode ?? null, slug: c?.slug ?? null, href: hrefFor(h.slot.kind, c?.slug ?? null) };
    }
    result.get(h.assetId)?.push(usage);
  }
  return result;
}

/** All usages of one asset. */
export async function usageOf(assetId: string): Promise<AssetUsage[]> {
  return (await findUsage([assetId])).get(assetId) ?? [];
}

/** Ids (among `assetIds`) that are used by at least one slot of a given usage kind, or by any slot. */
export async function usedAssetIds(assetIds: string[], kind?: UsageKind): Promise<Set<string>> {
  if (!assetIds.length) return new Set();
  const slots = ASSET_SLOTS.filter((s) => !kind || s.kind === kind);
  return new Set((await scanModels(slots, { in: assetIds })).map((h) => h.value));
}

/**
 * Points every slot that references `fromId` at `toId` — inside the caller's transaction, so a replace is all-or-nothing.
 * Returns how many references moved.
 */
export async function moveReferences(tx: Prisma.TransactionClient, fromId: string, toId: string): Promise<number> {
  let moved = 0;
  for (const s of ASSET_SLOTS) {
    const r = await delegate(tx, s.model).updateMany({ where: { [s.column]: fromId }, data: { [s.column]: toId } });
    moved += r.count;
  }
  return moved;
}

/** Every asset id wired into any slot of the given usage kinds (all kinds when omitted). Used for the Used/Unattached filters. */
export async function allUsedAssetIds(kinds?: UsageKind[]): Promise<Set<string>> {
  const slots = ASSET_SLOTS.filter((s) => !kinds || kinds.includes(s.kind));
  const hits = await scanModels(slots, { not: null });
  // a deleted title no longer uses its files (same rule as "Used by"), so the Movies / Unattached filters agree with the drawer
  const owners = [...new Set(hits.filter((h) => h.slot.ownerColumn).map((h) => h.row[h.slot.ownerColumn!]!).filter(Boolean))];
  const gone = new Set(owners.length ? (await prisma.content.findMany({ where: { id: { in: owners }, deletedAt: { not: null } }, select: { id: true } })).map((c) => c.id) : []);
  return new Set(hits.filter((h) => !(h.slot.ownerColumn && gone.has(h.row[h.slot.ownerColumn]!))).map((h) => h.value));
}

/** Ids of assets wired into any slot owned by one of these titles (used by "search by title / content code"). */
export async function assetIdsOwnedBy(contentIds: string[]): Promise<Set<string>> {
  if (!contentIds.length) return new Set();
  const found = new Set<string>();
  const byModel = groupByModel(ASSET_SLOTS.filter((s) => s.ownerColumn));
  await Promise.all(
    [...byModel].map(async ([model, group]) => {
      const owner = group[0]!.ownerColumn!;
      const rows = await delegate(prisma, model).findMany({ where: { [owner]: { in: contentIds } }, select: Object.fromEntries(group.map((s) => [s.column, true])) });
      for (const r of rows) for (const s of group) if (r[s.column]) found.add(r[s.column]!);
    }),
  );
  return found;
}
