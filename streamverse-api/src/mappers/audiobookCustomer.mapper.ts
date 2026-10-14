import type { AccessResult } from "../services/contentAccess.service";
import { mapCustomerBase, type CustomerContentBaseRow } from "./customerContent.mapper";

interface AudiobookListRow {
  content: CustomerContentBaseRow;
  author: string | null;
  narrator: string | null;
  coverAssetId: string | null;
  thumbnailAssetId: string | null;
  durationSeconds: number | null;
}

/** Card data for GET /audiobooks — Section 9. */
export function toAudiobookCard(row: AudiobookListRow) {
  const base = mapCustomerBase(row.content);
  return {
    id: base.id,
    slug: base.slug,
    title: base.title,
    author: row.author,
    narrator: row.narrator,
    coverAssetId: row.coverAssetId,
    thumbnailAssetId: row.thumbnailAssetId,
    durationSeconds: row.durationSeconds,
    genres: base.genres,
    promo: base.promo,
    ageRating: base.ageRating,
    rating: base.rating,
    reviewCount: base.reviewCount,
  };
}

interface AudiobookDetailRow extends AudiobookListRow {
  publisher: string | null;
  series: string | null;
  seriesNumber: number | null;
  deliveryMode: string;
  mainAssetId: string | null;
  previewAssetId: string | null;
  editions: { narrator: string; narratorBio: string | null; language: { code: string; name: string } }[];
  chapters: { chapterNumber: number; title: string; durationSeconds: number | null; audioAssetId: string | null; displayOrder: number }[];
}

/** Full detail for GET /audiobooks/:slug — Section 10. Never a raw private audio storage key. */
export function toAudiobookDetail(row: AudiobookDetailRow, access: AccessResult) {
  const base = mapCustomerBase(row.content);
  const hasAudio = row.deliveryMode === "CHAPTER_FILES" ? row.chapters.some((c) => !!c.audioAssetId) : !!row.mainAssetId;
  return {
    ...base,
    description: row.content.description,
    author: row.author,
    narrator: row.narrator,
    publisher: row.publisher,
    series: row.series,
    seriesNumber: row.seriesNumber,
    coverAssetId: row.coverAssetId,
    thumbnailAssetId: row.thumbnailAssetId,
    deliveryMode: row.deliveryMode,
    // the playable audio is never named until access.canConsume is true — see Section 56/10
    listeningReady: access.canConsume && hasAudio,
    chapters: row.chapters.map((c) => ({ chapterNumber: c.chapterNumber, title: c.title, durationSeconds: c.durationSeconds, hasAudio: !!c.audioAssetId })),
    editions: row.editions.map((e) => ({ narrator: e.narrator, narratorBio: e.narratorBio, language: e.language.code })),
    access,
  };
}
