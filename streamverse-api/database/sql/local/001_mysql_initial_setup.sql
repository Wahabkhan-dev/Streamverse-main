-- =============================================================================
-- FILE: local/001_mysql_initial_setup.sql
-- PURPOSE: Create the local development database and application user.
-- ENVIRONMENT: Local development only.
-- CLASSIFICATION: DEVELOPMENT ONLY — DO NOT RUN IN PRODUCTION
-- MODIFYING: Yes — creates database and user.
-- SAFE FOR PRODUCTION: NO. Production databases and users must be provisioned
--   by your hosting provider or DBA with appropriate permissions/passwords.
-- EXPECTED RESULT: Database streamverse_dev created; user 'streamverse'
--   created with full privileges on that database.
-- =============================================================================
-- HOW TO RUN (replace MYSQL_ROOT_PASSWORD with your actual root password):
--   mysql -u root -p < database/sql/local/001_mysql_initial_setup.sql
-- =============================================================================

-- NOTE: Do NOT hardcode passwords in this file.
-- Run with: mysql -u root -p
-- Then set the password interactively, or use environment variables.

CREATE DATABASE IF NOT EXISTS streamverse_dev
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Create application user (replace 'YOUR_PASSWORD' with a real password before running)
-- This is intentionally a placeholder — never commit real passwords.
-- Example: CREATE USER IF NOT EXISTS 'streamverse'@'localhost' IDENTIFIED BY 'your-actual-dev-password';
CREATE USER IF NOT EXISTS 'streamverse'@'localhost' IDENTIFIED BY 'YOUR_DEV_PASSWORD_HERE';

GRANT ALL PRIVILEGES ON streamverse_dev.* TO 'streamverse'@'localhost';
FLUSH PRIVILEGES;

-- Verify
SHOW DATABASES LIKE 'streamverse_dev';
SELECT User, Host FROM mysql.user WHERE User = 'streamverse';
