-- =============================================================================
-- FILE: local/007_performance_indexes.sql
-- PURPOSE: Record of the indexes added during the 2026-10-19 media/R2/performance audit.
-- ENVIRONMENT: Applied via `prisma db push` + `prisma migrate resolve --applied` locally
--   (the app DB user lacks CREATE privileges for Prisma's shadow database, so
--   `prisma migrate dev` cannot run here — see EXECUTION_LOG.md). The equivalent
--   migration file lives at prisma/migrations/20261019235944_add_performance_indexes/.
-- CLASSIFICATION: DEVELOPMENT RECORD — the real migration ships via `prisma migrate deploy`.
-- MODIFYING: Yes — adds three indexes, no data change.
-- SAFE FOR PRODUCTION: Yes, additive only. Apply via `prisma migrate deploy`, not this file.
-- WHY: Admin movie/ebook/audiobook/user lists default-sort by createdAt desc, and
--   analytics revenue range queries filter Payment by paidAt — neither had an index,
--   so both degrade to a full table scan as the tables grow.
-- =============================================================================

ALTER TABLE `Content` ADD INDEX `Content_createdAt_idx`(`createdAt`);
ALTER TABLE `User` ADD INDEX `User_createdAt_idx`(`createdAt`);
ALTER TABLE `Payment` ADD INDEX `Payment_paidAt_idx`(`paidAt`);
