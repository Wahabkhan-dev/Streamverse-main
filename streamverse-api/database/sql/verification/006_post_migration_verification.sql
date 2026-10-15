-- =============================================================================
-- FILE: verification/006_post_migration_verification.sql
-- PURPOSE: Final post-migration health checks — charset, collation, SQL mode,
--   connection test, and engine verification.
-- ENVIRONMENT: Local development, staging, and production (post-migration).
-- CLASSIFICATION: SAFE READ-ONLY
-- MODIFYING: No.
-- SAFE FOR PRODUCTION: Yes (read-only).
-- EXPECTED RESULT: All tables use InnoDB engine and utf8mb4_unicode_ci collation.
-- =============================================================================

USE streamverse_dev; -- Change to your database name for production

-- 1. Verify all tables use InnoDB engine
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND ENGINE != 'InnoDB';
-- EXPECTED: 0 rows (all tables should be InnoDB)

-- 2. Verify charset and collation
SELECT TABLE_NAME, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- 3. Database charset check
SELECT
  SCHEMA_NAME,
  DEFAULT_CHARACTER_SET_NAME,
  DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = DATABASE();

-- 4. MySQL version
SELECT VERSION() AS mysql_version;
-- EXPECTED: 8.x.x

-- 5. SQL mode — should contain STRICT_TRANS_TABLES
SELECT @@sql_mode AS sql_mode;

-- 6. Connection test
SELECT 1 AS connection_ok;

-- 7. Timezone
SELECT @@global.time_zone, @@session.time_zone;
-- Application should normalize all datetimes to UTC before persistence.

-- 8. Prisma migration status table
SELECT migration_name, finished_at, applied_steps_count
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 10;
