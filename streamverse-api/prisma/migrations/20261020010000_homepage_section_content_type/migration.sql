-- Homepage architecture fix (2026-10-20): a dynamic HomepageSection (TRENDING/POPULAR/NEW_RELEASE/
-- FEATURED/LATEST) must resolve against one specific catalog, never all content types mixed.
ALTER TABLE `HomepageSection` ADD COLUMN `contentType` ENUM('MOVIE', 'EBOOK', 'AUDIOBOOK') NULL;
