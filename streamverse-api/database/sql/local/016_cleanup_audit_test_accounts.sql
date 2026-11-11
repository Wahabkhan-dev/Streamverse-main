-- 016 — Remove the throwaway customer accounts created by the production-hardening audit of 2026-11-10 (LOCAL dev DB only).
--
-- Identification is deterministic, not a broad domain match. A row is deleted only when ALL of these hold:
--   * email matches exactly the audit scripts' pattern: audit-(a|b|race-a|race-b|load-N)-<13-digit ms timestamp>@streamverse.test
--   * role = USER, no Stripe customer attached
--   * created inside the audit window 2026-11-10 22:50:00 – 23:13:00 UTC
-- Inventory before running (read-only check): 46 accounts; related rows: AuthSession 48, PasswordResetToken 1,
-- UserSavedContent 2, MovieProgress 182, UserHistory 182, EbookBookmark 1, Device 12, PlaybackSession 1230;
-- 0 subscriptions, 0 payments, 0 notifications, 0 audit-log rows, 0 age verifications, 0 content/media created by them.
-- Every one of those tables references User with ON DELETE CASCADE, so deleting the accounts removes them.
-- Plus the single signed test webhook event the audit sent (exact id).

START TRANSACTION;

SELECT COUNT(*) AS audit_accounts_before
FROM `User`
WHERE email REGEXP '^audit-(a|b|race-a|race-b|load-[0-9]{1,2})-[0-9]{13}@streamverse[.]test$'
  AND role = 'USER' AND stripeCustomerId IS NULL
  AND createdAt BETWEEN '2026-11-10 22:50:00' AND '2026-11-10 23:13:00';

DELETE FROM `User`
WHERE email REGEXP '^audit-(a|b|race-a|race-b|load-[0-9]{1,2})-[0-9]{13}@streamverse[.]test$'
  AND role = 'USER' AND stripeCustomerId IS NULL
  AND createdAt BETWEEN '2026-11-10 22:50:00' AND '2026-11-10 23:13:00';

DELETE FROM `StripeEvent` WHERE stripeEventId = 'evt_audit_1794351030241' AND type = 'audit.ignored_event';

COMMIT;
