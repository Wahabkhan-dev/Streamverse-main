-- =============================================================================
-- FILE: verification/004_index_verification.sql
-- PURPOSE: Verify critical indexes exist on key tables for performance
--   and uniqueness enforcement.
-- ENVIRONMENT: Local development, staging, and production (post-migration).
-- CLASSIFICATION: SAFE READ-ONLY
-- MODIFYING: No.
-- SAFE FOR PRODUCTION: Yes (read-only).
-- EXPECTED RESULT: All listed indexes should appear.
-- =============================================================================

USE streamverse_dev; -- Change to your database name for production

SELECT
  TABLE_NAME,
  INDEX_NAME,
  NON_UNIQUE,
  COLUMN_NAME,
  SEQ_IN_INDEX
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'User', 'AuthSession', 'Content', 'Plan', 'Subscription',
    'Payment', 'Device', 'PlaybackSession', 'MovieProgress',
    'EbookProgress', 'AudiobookProgress', 'UserHistory',
    'AuditLog', 'StripeEvent'
  )
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Check unique constraints on business-critical fields
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  CONSTRAINT_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME != 'PRIMARY'
  AND REFERENCED_TABLE_NAME IS NULL  -- unique constraints only (not FK)
  AND TABLE_NAME IN ('User', 'Content', 'Plan', 'Subscription', 'AuthSession',
                     'PasswordResetToken', 'Device')
ORDER BY TABLE_NAME, COLUMN_NAME;
