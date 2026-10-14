import { mapContentBase, type ContentBaseRow } from "./content.mapper";

interface MovieFullRow {
  content: ContentBaseRow;
  runtimeMinutes: number | null;
  productionStudio: string | null;
  countryOfOrigin: string | null;
  copyrightOwner: string | null;
  copyrightYear: number | null;
  rightsNotes: string | null;
  posterAssetId: string | null;
  backdropAssetId: string | null;
  thumbnailAssetId: string | null;
  masterAssetId: string | null;
  trailerAssetId: string | null;
  teaserAssetId: string | null;
  cast: { id: string; name: string; characterName: string | null; imageAssetId: string | null; displayOrder: number }[];
  crew: { id: string; name: string; role: string; displayOrder: number }[];
  captions: { id: string; type: string; status: string; mediaAssetId: string | null; languageId: string; language: { code: string; name: string } }[];
  audioTracks: { id: string; status: string; mediaAssetId: string | null; languageId: string; language: { code: string; name: string } }[];
}

/** The full admin movie edit payload (Section 6) — maps cleanly onto the movie wizard's steps. */
export function toMovieAdminDto(row: MovieFullRow) {
  return {
    ...mapContentBase(row.content),
    movie: {
      runtimeMinutes: row.runtimeMinutes,
      productionStudio: row.productionStudio,
      countryOfOrigin: row.countryOfOrigin,
      copyrightOwner: row.copyrightOwner,
      copyrightYear: row.copyrightYear,
      rightsNotes: row.rightsNotes,
      posterAssetId: row.posterAssetId,
      backdropAssetId: row.backdropAssetId,
      thumbnailAssetId: row.thumbnailAssetId,
      masterAssetId: row.masterAssetId,
      trailerAssetId: row.trailerAssetId,
      teaserAssetId: row.teaserAssetId,
    },
    cast: row.cast.map((c) => ({ id: c.id, name: c.name, characterName: c.characterName, imageAssetId: c.imageAssetId, displayOrder: c.displayOrder })),
    crew: row.crew.map((c) => ({ id: c.id, name: c.name, role: c.role, displayOrder: c.displayOrder })),
    captions: row.captions.map((c) => ({ id: c.id, type: c.type, status: c.status, mediaAssetId: c.mediaAssetId, languageId: c.languageId, languageCode: c.language.code, languageName: c.language.name })),
    audioTracks: row.audioTracks.map((a) => ({ id: a.id, status: a.status, mediaAssetId: a.mediaAssetId, languageId: a.languageId, languageCode: a.language.code, languageName: a.language.name })),
  };
}
