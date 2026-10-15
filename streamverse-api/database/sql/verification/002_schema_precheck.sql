-- =============================================================================
-- FILE: verification/002_schema_precheck.sql
-- PURPOSE: Confirm the target database exists with correct charset/collation
--   before running Prisma migrations.
-- ENVIRONMENT: Local development and staging.
-- CLASSIFICATION: SAFE READ-ONLY
-- MODIFYING: No.
-- SAFE FOR PRODUCTION: Yes (read-only).
-- EXPECTED RESULT: One row showing streamverse_dev with utf8mb4 charset
--   and utf8mb4_unicode_ci collation.
-- =============================================================================

SELECT
  SCHEMA_NAME,
  DEFAULT_CHARACTER_SET_NAME,
  DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME IN ('streamverse_dev', 'streamverse_test', 'streamverse');

-- Also show MySQL version
SELECT VERSION() AS mysql_version;

-- Show current SQL mode (should include STRICT_TRANS_TABLES for data integrity)
SELECT @@GLOBAL.sql_mode AS global_sql_mode;
SELECT @@SESSION.sql_mode AS session_sql_mode;

-- Show timezone
SELECT @@GLOBAL.time_zone AS global_tz, @@SESSION.time_zone AS session_tz;
