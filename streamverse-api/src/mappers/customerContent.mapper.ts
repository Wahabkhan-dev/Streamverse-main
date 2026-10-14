import type { AccessResult } from "../services/contentAccess.service";

/** Shared pieces every customer-facing card/detail mapper reuses. Never the admin DTO (Section 11). */

interface GenreJoin {
  genre: { name: string; slug: string };
}
interface TagJoin {
  tag: { name: string };
}
interface LanguageJoin {
  role: string;
  language: { code: string; name: string };
}
interface WarningJoin {
  warningType: { key: string; label: string };
  notes: string | null;
}

export const mapGenreNames = (rows: GenreJoin[]) => rows.map((r) => r.genre.name);
export const mapTagNames = (rows: TagJoin[]) => rows.map((r) => r.tag.name);
export const mapLanguageSummary = (rows: LanguageJoin[]) => rows.map((r) => ({ code: r.language.code, name: r.language.name, role: r.role }));
export const mapWarningLabels = (rows: WarningJoin[]) => rows.map((r) => ({ key: r.warningType.key, label: r.warningType.label, notes: r.notes }));

export interface CustomerContentBaseRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  ageRating: string | null;
  releaseDate: Date | null;
  publishedAt: Date | null;
  featured: boolean;
  trending: boolean;
  popular: boolean;
  newRelease: boolean;
  genres: GenreJoin[];
  tags: TagJoin[];
  languages: LanguageJoin[];
  warnings: WarningJoin[];
}

/**
 * No rating/review model exists yet (Section 65) — `rating: null, reviewCount: 0`, never a frontend-made-up
 * number. No pretend media URL either (Section 56) — asset *ids* only; resolving them to a playable/
 * viewable URL is Phase 6's job.
 */
export function mapCustomerBase(content: CustomerContentBaseRow) {
  return {
    id: content.id,
    slug: content.slug,
    title: content.title,
    summary: content.summary,
    description: content.description,
    ageRating: content.ageRating,
    releaseDate: content.releaseDate,
    publishedAt: content.publishedAt,
    promo: { featured: content.featured, trending: content.trending, popular: content.popular, newRelease: content.newRelease },
    genres: mapGenreNames(content.genres),
    tags: mapTagNames(content.tags),
    languages: mapLanguageSummary(content.languages),
    warnings: mapWarningLabels(content.warnings),
    rating: null as number | null,
    reviewCount: 0,
  };
}

export const mapAccess = (access: AccessResult) => ({ access });

export interface MixedCoverFields {
  coverAssetId: string | null;
  headline: string | null; // runtime (movies) formatted elsewhere; author/narrator for books — kept as plain text here
}

/**
 * A title-agnostic card for places that mix movies/eBooks/audiobooks in one list (collections, homepage
 * manual sections, related content). Lighter than the per-type card — just enough to render a tile and
 * link to the right detail route by `type` + `slug`.
 */
export function mapMixedCard(content: CustomerContentBaseRow & { type: string }, cover: MixedCoverFields) {
  const base = mapCustomerBase(content);
  return { ...base, type: content.type, coverAssetId: cover.coverAssetId, headline: cover.headline };
}
