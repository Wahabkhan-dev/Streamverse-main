/** Shared pieces of the admin DTO every content type's mapper reuses — never a raw Prisma relation row. */

interface GenreJoin {
  genreId: string;
  genre: { id: string; name: string; slug: string };
}
interface TagJoin {
  tagId: string;
  tag: { id: string; name: string; slug: string };
}
interface LanguageJoin {
  languageId: string;
  role: string;
  language: { id: string; code: string; name: string };
}
interface WarningJoin {
  warningTypeId: string;
  notes: string | null;
  warningType: { id: string; key: string; label: string };
}
interface TerritoryRow {
  countryCode: string;
}

export const mapGenres = (rows: GenreJoin[]) => rows.map((r) => ({ id: r.genreId, name: r.genre.name, slug: r.genre.slug }));
export const mapTags = (rows: TagJoin[]) => rows.map((r) => ({ id: r.tagId, name: r.tag.name, slug: r.tag.slug }));
export const mapLanguages = (rows: LanguageJoin[]) => rows.map((r) => ({ languageId: r.languageId, code: r.language.code, name: r.language.name, role: r.role }));
export const mapWarnings = (rows: WarningJoin[]) => rows.map((r) => ({ id: r.warningTypeId, key: r.warningType.key, label: r.warningType.label, notes: r.notes }));
export const mapTerritoryCodes = (rows: TerritoryRow[]) => rows.map((r) => r.countryCode);

export interface ContentBaseRow {
  id: string;
  contentCode: string;
  type: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  status: string;
  visibility: string;
  ageRating: string | null;
  ageRestricted: boolean;
  minimumAge: number | null;
  territoryMode: string;
  releaseDate: Date | null;
  publishedAt: Date | null;
  publishAt: Date | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
  featured: boolean;
  trending: boolean;
  popular: boolean;
  newRelease: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  genres: GenreJoin[];
  tags: TagJoin[];
  languages: LanguageJoin[];
  warnings: WarningJoin[];
  territories: TerritoryRow[];
}

/** The part of the admin DTO identical for every content type. */
export function mapContentBase(content: ContentBaseRow) {
  return {
    id: content.id,
    contentCode: content.contentCode,
    type: content.type,
    title: content.title,
    slug: content.slug,
    summary: content.summary,
    description: content.description,
    status: content.status,
    visibility: content.visibility,
    age: { ageRating: content.ageRating, ageRestricted: content.ageRestricted, minimumAge: content.minimumAge },
    territory: { mode: content.territoryMode, countryCodes: mapTerritoryCodes(content.territories) },
    dates: { releaseDate: content.releaseDate, publishedAt: content.publishedAt, publishAt: content.publishAt, availableFrom: content.availableFrom, availableUntil: content.availableUntil },
    promo: { featured: content.featured, trending: content.trending, popular: content.popular, newRelease: content.newRelease },
    seo: { seoTitle: content.seoTitle, seoDescription: content.seoDescription, seoKeywords: content.seoKeywords },
    genres: mapGenres(content.genres),
    tags: mapTags(content.tags),
    languages: mapLanguages(content.languages),
    warnings: mapWarnings(content.warnings),
    createdById: content.createdById,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
    deletedAt: content.deletedAt,
  };
}

export const mapContentListRow = (content: ContentBaseRow) => ({
  id: content.id,
  contentCode: content.contentCode,
  title: content.title,
  slug: content.slug,
  status: content.status,
  visibility: content.visibility,
  genres: mapGenres(content.genres).map((g) => g.name),
  releaseDate: content.releaseDate,
  publishedAt: content.publishedAt,
  createdAt: content.createdAt,
  updatedAt: content.updatedAt,
});
