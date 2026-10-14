import { mapContentBase, type ContentBaseRow } from "./content.mapper";

interface AudiobookFullRow {
  content: ContentBaseRow;
  author: string | null;
  narrator: string | null;
  publisher: string | null;
  isbn: string | null;
  series: string | null;
  seriesNumber: number | null;
  releaseDate: Date | null;
  durationSeconds: number | null;
  deliveryMode: string;
  copyrightOwner: string | null;
  copyrightYear: number | null;
  rightsNotes: string | null;
  mainAssetId: string | null;
  previewAssetId: string | null;
  coverAssetId: string | null;
  thumbnailAssetId: string | null;
  editions: { id: string; narrator: string; narratorBio: string | null; narratorImageAssetId: string | null; audioAssetId: string | null; durationSeconds: number | null; languageId: string; language: { code: string; name: string } }[];
  chapters: { id: string; chapterNumber: number; title: string; audioAssetId: string | null; durationSeconds: number | null; startTimeSeconds: number | null; endTimeSeconds: number | null; displayOrder: number }[];
}

export function toAudiobookAdminDto(row: AudiobookFullRow) {
  return {
    ...mapContentBase(row.content),
    audiobook: {
      author: row.author,
      narrator: row.narrator,
      publisher: row.publisher,
      isbn: row.isbn,
      series: row.series,
      seriesNumber: row.seriesNumber,
      releaseDate: row.releaseDate,
      durationSeconds: row.durationSeconds,
      deliveryMode: row.deliveryMode,
      copyrightOwner: row.copyrightOwner,
      copyrightYear: row.copyrightYear,
      rightsNotes: row.rightsNotes,
      mainAssetId: row.mainAssetId,
      previewAssetId: row.previewAssetId,
      coverAssetId: row.coverAssetId,
      thumbnailAssetId: row.thumbnailAssetId,
    },
    editions: row.editions.map((e) => ({
      id: e.id,
      narrator: e.narrator,
      narratorBio: e.narratorBio,
      narratorImageAssetId: e.narratorImageAssetId,
      audioAssetId: e.audioAssetId,
      durationSeconds: e.durationSeconds,
      languageId: e.languageId,
      languageCode: e.language.code,
      languageName: e.language.name,
    })),
    chapters: row.chapters.map((c) => ({ id: c.id, chapterNumber: c.chapterNumber, title: c.title, audioAssetId: c.audioAssetId, durationSeconds: c.durationSeconds, startTimeSeconds: c.startTimeSeconds, endTimeSeconds: c.endTimeSeconds, displayOrder: c.displayOrder })),
  };
}
