import type { AccessResult } from "../services/contentAccess.service";
import { mapCustomerBase, type CustomerContentBaseRow } from "./customerContent.mapper";

interface EbookListRow {
  content: CustomerContentBaseRow;
  author: string | null;
  frontCoverAssetId: string | null;
  frontCoverAsset?: { storageKey: string | null } | null;
  thumbnailAssetId: string | null;
}

/** Card data for GET /ebooks — Section 7. `coverUrl` is the signed front-cover URL, batched in by the caller. */
export function toEbookCard(row: EbookListRow, coverUrl?: string | null) {
  const base = mapCustomerBase(row.content);
  return {
    id: base.id,
    slug: base.slug,
    title: base.title,
    author: row.author,
    summary: base.summary,
    image: coverUrl ?? null,
    coverAssetId: row.frontCoverAssetId,
    thumbnailAssetId: row.thumbnailAssetId,
    genres: base.genres,
    promo: base.promo,
    ageRating: base.ageRating,
    rating: base.rating,
    reviewCount: base.reviewCount,
  };
}

interface EbookDetailRow extends EbookListRow {
  coAuthor: string | null;
  editor: string | null;
  publisher: string | null;
  isbn: string | null;
  edition: string | null;
  series: string | null;
  seriesNumber: number | null;
  pageCount: number | null;
  publicationDate: Date | null;
  epubAssetId: string | null;
  pdfAssetId: string | null;
  sampleAssetId: string | null;
  backCoverAssetId: string | null;
  spineAssetId: string | null;
  fullWrapAssetId: string | null;
  flipbookEnabled: boolean;
  editions: { translatedTitle: string; translator: string | null; language: { code: string; name: string } }[];
}

/** Full detail for GET /ebooks/:slug — Section 8. Unpublished editions never exist to begin with (there is no "unpublished edition" concept), so none can leak. */
export function toEbookDetail(row: EbookDetailRow, access: AccessResult) {
  const base = mapCustomerBase(row.content);
  return {
    ...base,
    description: row.content.description,
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
    coverAssetId: row.frontCoverAssetId,
    thumbnailAssetId: row.thumbnailAssetId,
    sampleAssetId: row.sampleAssetId,
    backCoverAssetId: row.backCoverAssetId,
    spineAssetId: row.spineAssetId,
    fullWrapAssetId: row.fullWrapAssetId,
    // the readable file is never named until access.canConsume is true — see Section 56/8
    readingReady: access.canConsume && (!!row.epubAssetId || !!row.pdfAssetId),
    // a page-turn version exists (shown as an extra button on the book's page; opening it still needs access)
    flipbook: row.flipbookEnabled && !!row.pdfAssetId,
    editions: row.editions.map((e) => ({ translatedTitle: e.translatedTitle, translator: e.translator, language: e.language.code })),
    access,
  };
}
