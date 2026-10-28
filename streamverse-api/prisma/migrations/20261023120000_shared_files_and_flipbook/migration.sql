-- A stored file (video, EPUB/PDF, audio, captions...) may be used by several titles: they all point at the SAME stored object
-- (a link, never a copy). The UNIQUE indexes on these file columns become plain indexes (the new index is created first, so
-- the foreign keys always have an index). Also adds Ebook.flipbookEnabled: a page-turn version built from the book's PDF.

CREATE INDEX `Audiobook_mainAssetId_idx` ON `Audiobook`(`mainAssetId`);
DROP INDEX `Audiobook_mainAssetId_key` ON `Audiobook`;
CREATE INDEX `Audiobook_previewAssetId_idx` ON `Audiobook`(`previewAssetId`);
DROP INDEX `Audiobook_previewAssetId_key` ON `Audiobook`;
CREATE INDEX `AudiobookChapter_audioAssetId_idx` ON `AudiobookChapter`(`audioAssetId`);
DROP INDEX `AudiobookChapter_audioAssetId_key` ON `AudiobookChapter`;
CREATE INDEX `AudiobookEdition_audioAssetId_idx` ON `AudiobookEdition`(`audioAssetId`);
DROP INDEX `AudiobookEdition_audioAssetId_key` ON `AudiobookEdition`;
CREATE INDEX `Ebook_epubAssetId_idx` ON `Ebook`(`epubAssetId`);
DROP INDEX `Ebook_epubAssetId_key` ON `Ebook`;
CREATE INDEX `Ebook_pdfAssetId_idx` ON `Ebook`(`pdfAssetId`);
DROP INDEX `Ebook_pdfAssetId_key` ON `Ebook`;
CREATE INDEX `Ebook_sampleAssetId_idx` ON `Ebook`(`sampleAssetId`);
DROP INDEX `Ebook_sampleAssetId_key` ON `Ebook`;
CREATE INDEX `EbookEdition_epubAssetId_idx` ON `EbookEdition`(`epubAssetId`);
DROP INDEX `EbookEdition_epubAssetId_key` ON `EbookEdition`;
CREATE INDEX `EbookEdition_pdfAssetId_idx` ON `EbookEdition`(`pdfAssetId`);
DROP INDEX `EbookEdition_pdfAssetId_key` ON `EbookEdition`;
CREATE INDEX `Movie_masterAssetId_idx` ON `Movie`(`masterAssetId`);
DROP INDEX `Movie_masterAssetId_key` ON `Movie`;
CREATE INDEX `Movie_trailerAssetId_idx` ON `Movie`(`trailerAssetId`);
DROP INDEX `Movie_trailerAssetId_key` ON `Movie`;
CREATE INDEX `Movie_teaserAssetId_idx` ON `Movie`(`teaserAssetId`);
DROP INDEX `Movie_teaserAssetId_key` ON `Movie`;
CREATE INDEX `MovieAudioTrack_mediaAssetId_idx` ON `MovieAudioTrack`(`mediaAssetId`);
DROP INDEX `MovieAudioTrack_mediaAssetId_key` ON `MovieAudioTrack`;
CREATE INDEX `MovieCaption_mediaAssetId_idx` ON `MovieCaption`(`mediaAssetId`);
DROP INDEX `MovieCaption_mediaAssetId_key` ON `MovieCaption`;
ALTER TABLE `Ebook` ADD COLUMN `flipbookEnabled` BOOLEAN NOT NULL DEFAULT false;
