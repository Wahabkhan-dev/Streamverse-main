-- =============================================================================
-- FILE: verification/003_schema_verification.sql
-- PURPOSE: Verify all expected StreamVerse tables exist after migration.
-- ENVIRONMENT: Local development, staging, and production (post-migration check).
-- CLASSIFICATION: SAFE READ-ONLY
-- MODIFYING: No.
-- SAFE FOR PRODUCTION: Yes (read-only).
-- EXPECTED RESULT: All tables listed below should appear.
-- =============================================================================

USE streamverse_dev; -- Change to your database name for production

SHOW TABLES;

-- Check critical tables exist
SELECT
  TABLE_NAME,
  ENGINE,
  TABLE_COLLATION,
  TABLE_ROWS,
  CREATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'User',
    'AuthSession',
    'PasswordResetToken',
    'Content',
    'ContentSequence',
    'Movie',
    'Ebook',
    'Audiobook',
    'AudiobookChapter',
    'Plan',
    'Subscription',
    'Payment',
    'Refund',
    'Device',
    'PlaybackSession',
    'MovieProgress',
    'EbookProgress',
    'AudiobookProgress',
    'UserHistory',
    'EbookBookmark',
    'Notification',
    'AuditLog',
    'StripeEvent',
    'AnalyticsEvent',
    'LegalDocument',
    'LegalDocumentVersion',
    'AppSetting',
    'HomepageSection',
    'HomepageSectionItem',
    'Collection',
    'CollectionItem',
    'Banner',
    'MediaAsset',
    'UserAgeVerification',
    'UserSavedContent',
    'LibraryItem'
  )
ORDER BY TABLE_NAME;

-- Count tables
SELECT COUNT(*) AS total_tables
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE();
