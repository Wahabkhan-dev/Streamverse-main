-- =============================================================================
-- FILE: production/007_production_checklist.sql
-- PURPOSE: Pre-go-live production verification checklist. Run these queries
--   against the production database AFTER `npx prisma migrate deploy`.
-- ENVIRONMENT: PRODUCTION — run only after backup.
-- CLASSIFICATION: SAFE WITH REVIEW
-- MODIFYING: No (read-only verification only).
-- SAFE FOR PRODUCTION: Yes — all SELECT / SHOW / DESCRIBE only.
-- EXPECTED RESULT: See inline comments.
-- =============================================================================

-- !! IMPORTANT !!
-- 1. Take a full database backup before any migration
-- 2. Run `npx prisma migrate deploy` (not migrate dev / migrate reset)
-- 3. Then run this script to verify the result
-- 4. Log results in database/sql/EXECUTION_LOG.md

-- Step 1: Confirm database name and version
SELECT DATABASE() AS current_db;
SELECT VERSION() AS mysql_version;
-- EXPECTED: your production database name, MySQL 8.x

-- Step 2: Confirm all expected tables exist
SELECT COUNT(*) AS table_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE();
-- EXPECTED: >= 35 tables

-- Step 3: Confirm all migrations applied
SELECT migration_name, finished_at, applied_steps_count, rolled_back_at
FROM _prisma_migrations
ORDER BY finished_at ASC;
-- EXPECTED: All rows have finished_at set, rolled_back_at is NULL

-- Step 4: Confirm engine is InnoDB everywhere
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND ENGINE != 'InnoDB';
-- EXPECTED: 0 rows

-- Step 5: Confirm charset/collation
SELECT TABLE_NAME, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_COLLATION != 'utf8mb4_unicode_ci';
-- EXPECTED: 0 rows

-- Step 6: Confirm critical unique indexes
SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND NON_UNIQUE = 0
  AND INDEX_NAME != 'PRIMARY'
ORDER BY TABLE_NAME, INDEX_NAME;

-- Step 7: Smoke-test connection
SELECT 1 AS ok;

-- Step 8: Confirm Plan entitlement columns exist
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Plan'
ORDER BY ORDINAL_POSITION;

-- Step 9: Confirm dead fields are absent
SELECT COUNT(*) AS dead_field_count
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'User'
  AND COLUMN_NAME IN ('hasActiveSubscriptionDev', 'ageVerifiedAt');
-- EXPECTED: 0
