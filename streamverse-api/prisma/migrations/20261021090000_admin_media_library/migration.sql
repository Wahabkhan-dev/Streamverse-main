-- Admin Media Library (2026-10-21)
-- 1) Artwork slots (poster/backdrop/thumbnail/covers/banners/cast+narrator images) become shareable: each gets a plain
--    index FIRST (so the foreign key keeps an index to use), and only then the old UNIQUE index is dropped.
--    Files that belong to exactly one title (master video, EPUB/PDF, audio, captions) stay one-to-one.
CREATE INDEX `Audiobook_coverAssetId_idx` ON `Audiobook`(`coverAssetId`);
CREATE INDEX `Audiobook_thumbnailAssetId_idx` ON `Audiobook`(`thumbnailAssetId`);
CREATE INDEX `AudiobookEdition_narratorImageAssetId_idx` ON `AudiobookEdition`(`narratorImageAssetId`);
CREATE INDEX `Banner_desktopAssetId_idx` ON `Banner`(`desktopAssetId`);
CREATE INDEX `Banner_mobileAssetId_idx` ON `Banner`(`mobileAssetId`);
CREATE INDEX `Collection_bannerAssetId_idx` ON `Collection`(`bannerAssetId`);
CREATE INDEX `Ebook_frontCoverAssetId_idx` ON `Ebook`(`frontCoverAssetId`);
CREATE INDEX `Ebook_backCoverAssetId_idx` ON `Ebook`(`backCoverAssetId`);
CREATE INDEX `Ebook_spineAssetId_idx` ON `Ebook`(`spineAssetId`);
CREATE INDEX `Ebook_fullWrapAssetId_idx` ON `Ebook`(`fullWrapAssetId`);
CREATE INDEX `Ebook_thumbnailAssetId_idx` ON `Ebook`(`thumbnailAssetId`);
CREATE INDEX `EbookEdition_coverAssetId_idx` ON `EbookEdition`(`coverAssetId`);
CREATE INDEX `Movie_posterAssetId_idx` ON `Movie`(`posterAssetId`);
CREATE INDEX `Movie_backdropAssetId_idx` ON `Movie`(`backdropAssetId`);
CREATE INDEX `Movie_thumbnailAssetId_idx` ON `Movie`(`thumbnailAssetId`);
CREATE INDEX `MovieCast_imageAssetId_idx` ON `MovieCast`(`imageAssetId`);
DROP INDEX `Audiobook_coverAssetId_key` ON `Audiobook`;
DROP INDEX `Audiobook_thumbnailAssetId_key` ON `Audiobook`;
DROP INDEX `AudiobookEdition_narratorImageAssetId_key` ON `AudiobookEdition`;
DROP INDEX `Banner_desktopAssetId_key` ON `Banner`;
DROP INDEX `Banner_mobileAssetId_key` ON `Banner`;
DROP INDEX `Collection_bannerAssetId_key` ON `Collection`;
DROP INDEX `Ebook_backCoverAssetId_key` ON `Ebook`;
DROP INDEX `Ebook_frontCoverAssetId_key` ON `Ebook`;
DROP INDEX `Ebook_fullWrapAssetId_key` ON `Ebook`;
DROP INDEX `Ebook_spineAssetId_key` ON `Ebook`;
DROP INDEX `Ebook_thumbnailAssetId_key` ON `Ebook`;
DROP INDEX `EbookEdition_coverAssetId_key` ON `EbookEdition`;
DROP INDEX `Movie_backdropAssetId_key` ON `Movie`;
DROP INDEX `Movie_posterAssetId_key` ON `Movie`;
DROP INDEX `Movie_thumbnailAssetId_key` ON `Movie`;
DROP INDEX `MovieCast_imageAssetId_key` ON `MovieCast`;
-- 2) Library metadata + the generic LIBRARY_IMAGE asset type (appending an enum value is metadata-only).
ALTER TABLE `MediaAsset` ADD COLUMN `altText` VARCHAR(191) NULL,
    ADD COLUMN `caption` VARCHAR(191) NULL,
    ADD COLUMN `displayTitle` VARCHAR(191) NULL,
    ADD COLUMN `folder` VARCHAR(191) NULL,
    ADD COLUMN `notes` TEXT NULL,
    MODIFY `type` ENUM('LIBRARY_IMAGE', 'MOVIE_MASTER', 'POSTER', 'BACKDROP', 'THUMBNAIL', 'NORMAL_BANNER', 'HERO_BANNER', 'LATEST_RELEASE_BANNER', 'MOBILE_BANNER', 'TRAILER', 'TEASER', 'CAPTION', 'AUDIO_TRACK', 'EBOOK_EPUB', 'EBOOK_PDF', 'EBOOK_SAMPLE', 'EBOOK_FRONT_COVER', 'EBOOK_BACK_COVER', 'EBOOK_SPINE', 'EBOOK_FULL_WRAP', 'AUDIOBOOK_FILE', 'AUDIOBOOK_PREVIEW', 'AUDIOBOOK_COVER', 'AUDIOBOOK_CHAPTER', 'NARRATOR_IMAGE') NOT NULL;
-- 3) Indexes for the library's default sort and folder filter.
CREATE INDEX `MediaAsset_createdAt_idx` ON `MediaAsset`(`createdAt`);
CREATE INDEX `MediaAsset_folder_idx` ON `MediaAsset`(`folder`);
