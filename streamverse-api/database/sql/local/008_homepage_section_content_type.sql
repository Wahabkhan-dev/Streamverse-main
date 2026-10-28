-- =============================================================================
-- FILE: local/008_homepage_section_content_type.sql
-- PURPOSE: Backfill HomepageSection.contentType for the baseline sections seeded before the
--   column existed. The column itself was added via `prisma db push` (see the matching migration
--   at prisma/migrations/20261020010000_homepage_section_content_type/) for the same shadow-DB
--   permission reason documented in 007_performance_indexes.sql.
-- CLASSIFICATION: DEVELOPMENT RECORD. Production has no pre-existing rows to backfill, since this
--   column ships with the migration from day one there.
-- MODIFYING: Yes — sets a column value on known seed rows only, by their unique `key`. No deletes.
-- WHY: `listDynamic()` had no content-type filter, so a section literally named "Featured eBooks"
--   could resolve a movie that happened to share the global `featured` flag. The fix requires every
--   dynamic (non-MANUAL) section to declare which catalog it resolves against.
-- =============================================================================

UPDATE `HomepageSection` SET `contentType` = 'MOVIE'     WHERE `key` IN ('trending_movies', 'popular_movies', 'latest_movies');
UPDATE `HomepageSection` SET `contentType` = 'EBOOK'     WHERE `key` IN ('featured_ebooks', 'new_ebooks');
UPDATE `HomepageSection` SET `contentType` = 'AUDIOBOOK' WHERE `key` IN ('featured_audiobooks', 'new_audiobooks');
-- MANUAL sections (hero, continue, collections) keep contentType = NULL — no change needed.
