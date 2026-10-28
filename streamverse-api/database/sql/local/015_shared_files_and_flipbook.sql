-- A stored file (video, EPUB/PDF, audio, captions...) may be used by several titles: they all point at the SAME stored object
-- (a link, never a copy). The UNIQUE indexes on these file columns become plain indexes (the new index is created first, so
-- the foreign keys always have an index). Also adds Ebook.flipbookEnabled: a page-turn version built from the book's PDF.

CREATE INDEX `Audiobook_mainAssetId_idx` ON `audiobook`(`mainAssetId`);
DROP INDEX `Audiobook_mainAssetId_key` ON `audiobook`;
CREATE INDEX `Audiobook_previewAssetId_idx` ON `audiobook`(`previewAssetId`);
DROP INDEX `Audiobook_previewAssetId_key` ON `audiobook`;
CREATE INDEX `AudiobookChapter_audioAssetId_idx` ON `audiobookchapter`(`audioAssetId`);
DROP INDEX `AudiobookChapter_audioAssetId_key` ON `audiobookchapter`;
CREATE INDEX `AudiobookEdition_audioAssetId_idx` ON `audiobookedition`(`audioAssetId`);
DROP INDEX `AudiobookEdition_audioAssetId_key` ON `audiobookedition`;
CREATE INDEX `Ebook_epubAssetId_idx` ON `ebook`(`epubAssetId`);
DROP INDEX `Ebook_epubAssetId_key` ON `ebook`;
CREATE INDEX `Ebook_pdfAssetId_idx` ON `ebook`(`pdfAssetId`);
DROP INDEX `Ebook_pdfAssetId_key` ON `ebook`;
CREATE INDEX `Ebook_sampleAssetId_idx` ON `ebook`(`sampleAssetId`);
DROP INDEX `Ebook_sampleAssetId_key` ON `ebook`;
CREATE INDEX `EbookEdition_epubAssetId_idx` ON `ebookedition`(`epubAssetId`);
DROP INDEX `EbookEdition_epubAssetId_key` ON `ebookedition`;
CREATE INDEX `EbookEdition_pdfAssetId_idx` ON `ebookedition`(`pdfAssetId`);
DROP INDEX `EbookEdition_pdfAssetId_key` ON `ebookedition`;
CREATE INDEX `Movie_masterAssetId_idx` ON `movie`(`masterAssetId`);
DROP INDEX `Movie_masterAssetId_key` ON `movie`;
CREATE INDEX `Movie_trailerAssetId_idx` ON `movie`(`trailerAssetId`);
DROP INDEX `Movie_trailerAssetId_key` ON `movie`;
CREATE INDEX `Movie_teaserAssetId_idx` ON `movie`(`teaserAssetId`);
DROP INDEX `Movie_teaserAssetId_key` ON `movie`;
CREATE INDEX `MovieAudioTrack_mediaAssetId_idx` ON `movieaudiotrack`(`mediaAssetId`);
DROP INDEX `MovieAudioTrack_mediaAssetId_key` ON `movieaudiotrack`;
CREATE INDEX `MovieCaption_mediaAssetId_idx` ON `moviecaption`(`mediaAssetId`);
DROP INDEX `MovieCaption_mediaAssetId_key` ON `moviecaption`;
ALTER TABLE `ebook` ADD COLUMN `flipbookEnabled` BOOLEAN NOT NULL DEFAULT false;
