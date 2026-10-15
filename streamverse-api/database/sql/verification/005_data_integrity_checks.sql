-- =============================================================================
-- FILE: verification/005_data_integrity_checks.sql
-- PURPOSE: Verify foreign key relationships and check for dead fields that
--   should NOT be present (hasActiveSubscriptionDev, ageVerifiedAt).
-- ENVIRONMENT: Local development and staging.
-- CLASSIFICATION: SAFE READ-ONLY
-- MODIFYING: No.
-- SAFE FOR PRODUCTION: Yes (read-only).
-- EXPECTED RESULT: Foreign keys listed; dead fields return zero columns.
-- =============================================================================

USE streamverse_dev; -- Change to your database name for production

-- Foreign key verification
SELECT
  CONSTRAINT_NAME,
  TABLE_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- Dead field check: these columns must NOT exist (removed in Phase 8)
-- EXPECTED: 0 rows for each
SELECT 'hasActiveSubscriptionDev' AS dead_field, COUNT(*) AS found
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'User'
  AND COLUMN_NAME = 'hasActiveSubscriptionDev'
UNION ALL
SELECT 'ageVerifiedAt' AS dead_field, COUNT(*) AS found
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'User'
  AND COLUMN_NAME = 'ageVerifiedAt';

-- Plan entitlements verification
SELECT
  COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Plan'
  AND COLUMN_NAME IN (
    'maxDevices', 'maxConcurrentStreams', 'maxVideoQuality',
    'ebooksEnabled', 'audiobooksEnabled', 'moviesEnabled', 'features'
  )
ORDER BY COLUMN_NAME;

-- Device table structure
DESCRIBE Device;

-- PlaybackSession table structure
DESCRIBE PlaybackSession;

-- ContentSequence table (race-safe content code generation)
DESCRIBE ContentSequence;
SELECT * FROM ContentSequence;
