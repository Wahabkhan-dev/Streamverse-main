import { mapContentBase, type ContentBaseRow } from "./content.mapper";

interface EbookFullRow {
  content: ContentBaseRow;
  author: string | null;
  coAuthor: string | null;
  editor: string | null;
  publisher: string | null;
  isbn: string | null;
  edition: string | null;
  series: string | null;
  seriesNumber: number | null;
  pageCount: number | null;
  publicationDate: Date | null;
  copyrightOwner: string | null;
  copyrightYear: number | null;
  rightsNotes: string | null;
  epubAssetId: string | null;
  pdfAssetId: string | null;
  sampleAssetId: string | null;
  frontCoverAssetId: string | null;
  backCoverAssetId: string | null;
  spineAssetId: string | null;
  fullWrapAssetId: string | null;
  thumbnailAssetId: string | null;
  flipbookEnabled: boolean;
  editions: { id: string; translatedTitle: string; translator: string | null; epubAssetId: string | null; pdfAssetId: string | null; coverAssetId: string | null; languageId: string; language: { code: string; name: string } }[];
}

export function toEbookAdminDto(row: EbookFullRow) {
  return {
    ...mapContentBase(row.content),
    ebook: {
      author: row.author,
      coAuthor: row.coAuthor,
      editor: row.editor,
      publisher: row.publisher,
      isbn: row.isbn,
      edition: row.edition,
      series: row.series,
      seriesNumber: row.seriesNumber,
      pageCount: row.pageCount,
      publicationDate: row.publicationDate,
      copyrightOwner: row.copyrightOwner,
      copyrightYear: row.copyrightYear,
      rightsNotes: row.rightsNotes,
      epubAssetId: row.epubAssetId,
      pdfAssetId: row.pdfAssetId,
      sampleAssetId: row.sampleAssetId,
      frontCoverAssetId: row.frontCoverAssetId,
      backCoverAssetId: row.backCoverAssetId,
      spineAssetId: row.spineAssetId,
      fullWrapAssetId: row.fullWrapAssetId,
      thumbnailAssetId: row.thumbnailAssetId,
      flipbookEnabled: row.flipbookEnabled,
    },
    editions: row.editions.map((e) => ({
      id: e.id,
      translatedTitle: e.translatedTitle,
      translator: e.translator,
      epubAssetId: e.epubAssetId,
      pdfAssetId: e.pdfAssetId,
      coverAssetId: e.coverAssetId,
      languageId: e.languageId,
      languageCode: e.language.code,
      languageName: e.language.name,
    })),
  };
}
