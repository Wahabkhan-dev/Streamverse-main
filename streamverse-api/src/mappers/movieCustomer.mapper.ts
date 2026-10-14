import type { AccessResult } from "../services/contentAccess.service";
import { mapCustomerBase, type CustomerContentBaseRow } from "./customerContent.mapper";

interface MovieListRow {
  content: CustomerContentBaseRow;
  posterAssetId: string | null;
  backdropAssetId: string | null;
  thumbnailAssetId: string | null;
  runtimeMinutes: number | null;
}

/** Card data for GET /movies — Section 5. */
export function toMovieCard(row: MovieListRow) {
  const base = mapCustomerBase(row.content);
  return {
    id: base.id,
    slug: base.slug,
    title: base.title,
    summary: base.summary,
    posterAssetId: row.posterAssetId,
    thumbnailAssetId: row.thumbnailAssetId,
    backdropAssetId: row.backdropAssetId,
    releaseDate: base.releaseDate,
    runtimeMinutes: row.runtimeMinutes,
    ageRating: base.ageRating,
    genres: base.genres,
    promo: base.promo,
    rating: base.rating,
    reviewCount: base.reviewCount,
  };
}

interface MovieDetailRow extends MovieListRow {
  trailerAssetId: string | null;
  teaserAssetId: string | null;
  masterAssetId: string | null;
  productionStudio: string | null;
  countryOfOrigin: string | null;
  cast: { name: string; characterName: string | null; imageAssetId: string | null; displayOrder: number }[];
  crew: { name: string; role: string; displayOrder: number }[];
  captions: { type: string; status: string; language: { code: string; name: string } }[];
  audioTracks: { status: string; language: { code: string; name: string } }[];
}

/** Full detail for GET /movies/:slug — Section 6. `access` comes from contentAccess.service.ts. */
export function toMovieDetail(row: MovieDetailRow, access: AccessResult) {
  const base = mapCustomerBase(row.content);
  return {
    ...base,
    description: row.content.description,
    posterAssetId: row.posterAssetId,
    backdropAssetId: row.backdropAssetId,
    thumbnailAssetId: row.thumbnailAssetId,
    trailerAssetId: row.trailerAssetId,
    teaserAssetId: row.teaserAssetId,
    // the playable master file is never named until access.canConsume is true — see Section 56/6
    mediaReady: access.canConsume && !!row.masterAssetId,
    runtimeMinutes: row.runtimeMinutes,
    productionStudio: row.productionStudio,
    countryOfOrigin: row.countryOfOrigin,
    cast: row.cast.map((c) => ({ name: c.name, characterName: c.characterName, imageAssetId: c.imageAssetId })),
    crew: row.crew.map((c) => ({ name: c.name, role: c.role })),
    captions: row.captions.map((c) => ({ type: c.type, ready: c.status === "READY", language: c.language.code })),
    audioTracks: row.audioTracks.map((a) => ({ ready: a.status === "READY", language: a.language.code })),
    access,
  };
}
