-- 017 — Remove data created by the launch-blocker verification run of 2026-11-11 (LOCAL dev DB only).
--
-- 1. The load/memory-test customers (60): email exactly audit-load-<N>-<13-digit ms timestamp>@streamverse.test, role USER,
--    no Stripe customer, created 2026-11-11 00:22–17:56 UTC. Their rows (sessions, progress, history, list, playback sessions)
--    go with them (ON DELETE CASCADE). 0 subscriptions / payments.
-- 2. Eleven unattached media rows, by exact id (checked first: no content, no slot uses them, no renditions, no multipart rows):
--    7 UPLOADING rows from wizard uploads the browser could not send (R2 CORS blocked the :8090/:5180 test origins, so no
--    object reached R2), and 4 FAILED rows from the bad-media smoke test (local dev storage, not R2).
-- NOT touched: the E2E suite's own per-run accounts (qa-*, pay-*), which are linked to Stripe TEST customers/subscriptions.

START TRANSACTION;

DELETE FROM `User`
WHERE email REGEXP '^audit-load-[0-9]{1,2}-[0-9]{13}@streamverse[.]test$'
  AND role = 'USER' AND stripeCustomerId IS NULL
  AND createdAt BETWEEN '2026-11-11 00:22:00' AND '2026-11-11 17:57:00';

DELETE FROM `MediaAsset`
WHERE id IN (
  'cmwcc9nzo004fvvkg0c52mkrp', 'cmwcd9yyu007pvvkgkvmabxd0', 'cmwcddhz9007tvvkgodz1uela', 'cmwcdgmy9007xvvkgxv0i0k9w',
  'cmwcdxbgy003jvvvgubnkvd2j', 'cmwce04wm003nvvvgqoqcbwze', 'cmwce2vq3003rvvvgpsdzdr17',
  'cmwcf1tky0003vvu0fc7x4krj', 'cmwcf1zjg0009vvu02tm9h484', 'cmwcf6asz0003vvi0jr4uotp5', 'cmwcf6dl90009vvi0z43vabl6'
)
  AND status IN ('UPLOADING', 'FAILED') AND contentId IS NULL;

COMMIT;
