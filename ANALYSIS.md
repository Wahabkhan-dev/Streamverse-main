> Historical report. See [the current October 23 audit](PROJECT-AUDIT-2026-10-23.md) for rechecked findings, security results and verification limits.

﻿# StreamVerse cross-check — 2026-10-15

This replaces the earlier review. The original is preserved in ANALYSIS-2026-10-12.md. Scope: first-party frontend/backend source, API contracts, Prisma schema/migrations, auth, billing, entitlement, media delivery, workers and automated checks. Dependencies/generated Prisma files were inspected where relevant, not treated as application code to edit. Findings below are static code defects unless marked as runtime checks or limitations. No application code or database records were changed.

## Current verified status

- Database: CONNECTED. A Prisma SELECT 1 and User count query both succeeded. Schema metadata contains all generated Prisma model tables (comparison normalizes case). The current provider is MySQL, replacing the previous PostgreSQL setup.
- The live Subscription table has a unique userId index, confirming issue B1 below.
- Backend typecheck: passed.
- Frontend TypeScript check: passed.
- Frontend production build: passed.
- Frontend lint: 14,466 errors and 74 warnings. Most are formatting/line-ending complaints; these are not 14,466 independent runtime bugs.
- Test results are recorded at the end after the current runs finish. Prior test counts must not be presented as current.

## Frontend/backend integration defects

| ID | Priority | Issue and user impact | Evidence |
|---|---|---|---|
| F1 | High | Registration sends name, but the backend requires fullName. Real registration fails validation. | streamverse/src/api/auth.api.ts register; streamverse-api/src/validators/auth.validator.ts registerSchema |
| F2 | High | Password reset sends password, but the backend requires newPassword. Reset links cannot complete the real reset flow. | auth.api.ts resetPassword; auth.validator.ts resetPasswordSchema |
| F3 | High | Catalog types do not match backend responses. Movie list cards have no cast, but apiMovieToLocal unconditionally calls m.cast.map; list rendering can throw. Fields such as image/year/duration also differ from posterAssetId/releaseDate/runtimeMinutes. Generic TypeScript annotations do not transform JSON. | src/lib/api-mappers.ts:11-29; src/api/types.ts ApiMovie; backend mappers/movieCustomer.mapper.ts |
| F4 | High | Watch route still resolves titles only from the browser-local catalog. Backend-only movie slugs cannot reach the player. | src/routes/watch.$slug.tsx WatchPage; src/lib/items.ts |
| F5 | High | Movie playback sends m.slug to a backend endpoint that looks up Content.id. Valid titles receive a not-found response. Audiobook player similarly sends b.slug. Progress writes also use slugs where Content.id is required. | players/MoviePlayer.tsx:88,151; players/AudiobookPlayer.tsx; backend repositories/entitlement.repository.ts, mediaAccess.repository.ts, services/progress.service.ts |
| F6 | High | Movie player accepts a URL only when playback.mode is SINGLE_FILE. The movie backend returns playback {url, expiresAt}, with no mode, for HLS. Even a successful response is treated as unavailable. No HLS client adapter is present in the player for browsers without native HLS. | MoviePlayer.tsx:92; backend services/mediaAccess.service.ts getMoviePlayback |
| F7 | High | Checkout redirect reads res.data.url, while backend returns checkoutUrl. A successful checkout request does not redirect through this hook. | hooks/useApiSubscription.ts useCheckoutMutation; backend services/billing/subscription.service.ts createCheckoutSession |
| F8 | High | Payment-method setup calls POST /setup-intent, but backend implements POST /setup. Default method uses PATCH, while backend implements POST /:id/default. Both operations fail routing. | api/me.api.ts; backend routes/paymentMethod.routes.ts |
| F9 | Medium | Profile sends name/avatar/language/age fields, while backend accepts fullName/avatarUrl/preferredLanguage and other explicit preferences. Unsupported fields are stripped, so a successful request can leave profile values unchanged. ApiUser also expects a different shape from serializeUser (fullName, avatarUrl, nested preferences). | api/me.api.ts updateProfile; api/types.ts ApiUser; backend validators/user.validator.ts, services/user.service.ts |
| F10 | Medium | verifyAge posts no dateOfBirth, which backend validation requires. | api/me.api.ts verifyAge; backend validators/ageVerification.validator.ts |
| F11 | Medium | Playback progress sends fractional positionSeconds from media time, but backend requires integers. Movie/audio payloads omit durationSeconds, so server completion percentage may remain zero even after ID routing is corrected. Ebook client fields positionPage/chapterIndex do not match backend page/location/chapterId contracts. | players/MoviePlayer.tsx, AudiobookPlayer.tsx; api/me.api.ts; backend validators/progress.validator.ts, services/progress.service.ts |
| F12 | Medium | Paginated frontend types expect meta while backend emits pagination. Subscription UI expects lowercase status values but backend emits ACTIVE/TRIALING/etc. Invoice UI expects paid/open while backend emits SUCCEEDED/FAILED/etc and returns {rows,pagination} inside data. UI status, history and pagination behavior are unreliable. | api/types.ts; routes/_site.subscription.tsx; backend utils/apiResponse.ts, services/billing/payment.service.ts, subscription.service.ts |
| F13 | High | Admin layout still checks browser-local useRole rather than authenticated API user.role. A valid backend admin can be denied by the UI; changing browser state unlocks the UI shell (backend API role checks still protect server data). | routes/admin.tsx |
| F14 | Medium | API client refreshes and redirects on every initial 401, including invalid login credentials. A wrong-password response can be replaced by a session-expired redirect, or retried with an unrelated existing session. | api/client.ts apiFetch; api/auth.api.ts login |
| F15 | Medium | Private customer queries are enabled whenever demo mode is off, without checking auth readiness. Components using them can trigger refresh/redirect for anonymous visitors instead of presenting a sign-in gate. | hooks/useApiMe.ts, useApiSubscription.ts |
| F16 | High | Admin upload client sends filename/contentType/type but backend requires fileName/mimeType/purpose/sizeBytes. Completion calls /admin/uploads/complete with a key instead of /admin/uploads/:assetId/complete. Real uploads cannot complete through this adapter. | api/admin.api.ts adminMediaApi; backend validators/upload.validator.ts, routes/upload.routes.ts |
| F17 | Medium | Several admin adapters reference unimplemented/different contracts: /admin/users routes are not mounted; revenue calls /admin/analytics rather than /admin/analytics/revenue; settings PATCH sends flat fields rather than {settings:[{key,value}]}. | api/admin.api.ts; backend routes/admin.routes.ts, adminAnalytics.routes.ts |

## Backend defects and risks

| ID | Priority | Issue and impact | Evidence |
|---|---|---|---|
| B1 | High | Resubscription inserts by new stripeSubscriptionId, but userId remains unique. Once a user has an old subscription row, syncing their new Stripe subscription attempts a second row and violates the userId constraint. The external subscription can be paid while local access fails. | services/billing/subscription.service.ts:89; repositories/subscription.repository.ts; prisma/schema.prisma:1236; live index verified |
| B2 | High | Stream-limit rejection is swallowed. Both media controllers catch every startPlaybackSession error, including CONCURRENT_STREAM_LIMIT_REACHED, and still return the authorized URL. The limit therefore does not enforce consumption. Session count/create also is not atomic. | controllers/mediaAccess.controller.ts moviePlayback/audiobookPlayback; services/playbackSession.service.ts |
| B3 | High | Private HLS delivery signs only the master playlist. Relative variant playlists and segment requests are not authorized by its individual S3 signature. Playback fails with private objects; making objects public bypasses subscription protection. | services/mediaAccess.service.ts; services/media/videoProcessing.service.ts; services/storage/s3.storage.provider.ts |
| B4 | High | Webhook controller acknowledges all existing PENDING events as already processed. A crash after inserting PENDING but before dispatch leaves the event permanently ignored on retries. New-event read/create also remains non-atomic. Use processing leases and recover stale claims. | controllers/webhook.controller.ts existing-status branch |
| B5 | High | UNPAID is treated as an irreversible terminal state. A later legitimate recovery to ACTIVE is ignored, preventing restored access after payment recovery. The guard also does not order ACTIVE/PAST_DUE changes, so other stale-event regressions remain possible. | services/billing/subscription.service.ts TERMINAL_STATUSES and applyStripeSubscriptionSnapshot |
| B6 | Medium | Checkout idempotency only covers the same user+plan within the same clock minute. Another minute or another plan creates another checkout before active-state synchronization. This reduces double-clicks but does not prevent multiple subscriptions. | services/billing/subscription.service.ts createCheckoutSession |
| B7 | Medium | Replacing Plan.stripePriceId removes the only price-to-plan mapping for existing subscribers on the old price. Their next sync cannot resolve a plan. | services/billing/subscription.service.ts resolvePlanIdForPrice |
| B8 | Medium | Entitlement cache is invalidated for subscription/age updates, but content invalidation has no call sites and profile country updates do not invalidate the user. Unpublish/restriction/location changes can use stale decisions until TTL. Cache expiry is not clamped to availability deadlines. | services/entitlement/entitlementCache.service.ts; services/user.service.ts; content services; checkAccess |
| B9 | Medium | Catalog and playback use different access engines. Catalog accepts any age-verification row without checking the title's minimumAge, denies all SCHEDULED titles, and allows unknown country. Playback checks minimum age, allows due SCHEDULED titles and denies unknown country. Detail/access flags can contradict real authorization. Country is self-editable, so territorial licensing is not based on trusted location. | services/contentAccess.service.ts versus services/entitlement/entitlement.service.ts |
| B10 | Medium | Device/stream registration checks count then inserts without a transaction/lock. Concurrent requests can exceed limits. Playback does not validate a device registration. Frontend players do not use returned sessionId to heartbeat/end sessions. | services/device.service.ts, playbackSession.service.ts; controllers/mediaAccess.controller.ts; frontend players |

## Corrections to the old report

- Database connection failure is no longer current. Read-only database checks now pass.
- Frontend API integration now exists, but the contract mismatches above prevent calling it complete.
- Current invoice parser supports parent.subscription_details and invoice.payments, with legacy fallback. Old-field-only parsing is fixed. Live Stripe event expansion and refunds still need provider verification.
- Payment handlers now protect settled/refunded rows from sequential late paid/failed events. The previous sequential-regression finding is fixed; concurrent writes still need real database tests.
- Inline workers are now registered by createApp. The dropped-inline-job finding is fixed.
- Storage reconciliation now advances checkedAt. With the current MySQL provider ascending NULL ordering visits unchecked rows; the previous unchanged-batch finding is fixed.
- A Resend email provider now exists. It falls back to console if the key is absent, so delivery depends on deployment configuration.
- Stripe Customer creation already uses a stable provider idempotency key; duplicate-customer creation is not asserted as a confirmed defect.

## Incomplete features and verification limits

- Malware scanner still returns NOT_CONFIGURED.
- Demo mode still defaults on unless VITE_DEMO_MODE=false is explicitly set.
- Automated integration tests use fake Prisma/provider implementations; database rollback, uniqueness, concurrency, real private HLS delivery and real Stripe payloads are not established by their passing results.
- SELECT 1, schema metadata and User count prove current database connectivity; they do not prove every feature or migration is correct.
- This review does not guarantee every possible bug has been found. Fix API contract mismatches and B1-B5 first, then test real-mode end-to-end flows.

## Automated test runs

The limited-worker test runs have completed. Backend: 510/510 passed. Frontend: 103 passed, 5 timed out, and 2 worker-start errors. Output is saved in recheck-backend-tests.log and recheck-frontend-tests.log. The frontend also reports JSDOM canvas limitations. See the deeper-review section for isolated reproductions of defects not caught by the broad suite.

## Deeper review — additional findings

These 13 entries are additional to F1–F17 and B1–B10. Several are reproduced using review-probes.cjs, which transpiles the actual source with TypeScript and injects local fakes. These checks deliberately assert the observed faulty behavior; a passing probe means the defect was reproduced, not fixed. They make no network calls and do not alter the database.

| ID | Priority | Additional issue | Evidence and reproduction |
|---|---|---|---|
| N1 | High | Different movie uploads for the same title share HLS output keys. The UUID in the source path is discarded, so processing a replacement overwrites the live title's master/variant/segment paths before the replacement is attached. Concurrent jobs can also mix output or hit unique storageKey constraints. | services/media/storageKey.service.ts masterPlaylistKey/renditionSegmentKey; probe confirms upload-A.mp4 and upload-B.mp4 resolve to identical derived keys. Include the source asset ID in all derived paths. |
| N2 | Medium | Dashboard refund accounting can report negative revenue for a fully refunded payment. getRevenueSummary selects only SUCCEEDED payments, excludes REFUNDED/PARTIALLY_REFUNDED charges, then subtracts successful refunds again. | repositories/analytics.repository.ts:58-72; probe reproduces a $10 charge fully refunded reporting -$10 instead of $0. Count original settled charges before subtracting refunds once. |
| N3 | Medium | Revenue totals/time series sum different currencies without conversion or a currency label. USD and JPY minor units are added together; the result has no valid monetary meaning even though a byCurrency breakdown is also returned. | services/analytics/revenueAnalytics.service.ts getRevenueAnalytics; repositories/analytics.repository.ts getRevenueSummary. Restrict to a selected currency or return separate per-currency series/totals. |
| N4 | High | Refunds initiated through the Stripe dashboard or another system are ignored unless a local row already has their stripeRefundId. Payment status, refunds and revenue remain incorrect after a verified external refund event. | services/billing/refund.service.ts applyStripeRefundEvent returns immediately when findByStripeRefundId returns null; reproduced by probe. Resolve the known PaymentIntent/charge and upsert the refund. |
| N5 | Medium | Asynchronous refund status transitions are not fully synchronized. Only charge.refunded is handled, with no refund.updated/refund.failed handler or refund reconciliation. A local PENDING refund can stay pending after a later failure/cancellation, reserving refundable balance indefinitely. Notifications also claim refund processed before success is established. | services/billing/stripeWebhook.service.ts handler map; refund.service.ts refundPayment and totalRefundedOrPending use. Handle refund lifecycle updates and reconcile their final state. |
| N6 | Medium | Storage cleanup deletes the database row even when deleteObject fails. This discards the key needed for future retries and reports the object as removed while it still exists. | services/media/mediaCleanup.service.ts:20-21,31-32; isolated probe reproduces hardDelete and expiredRemoved=1 after a simulated storage outage. Keep the row until object deletion succeeds. |
| N7 | Medium | Removing a movie master does not delete its HLS master playlist/segments. Cleanup deletes only asset.storageKey; sourceAssetId cascades remove rendition database rows, while no prefix/object traversal deletes the stored derived files. This creates orphaned media and ongoing storage charges. | services/media/mediaCleanup.service.ts; repositories/mediaAsset.repository.ts hardDelete; prisma/schema.prisma MediaAsset sourceAsset relation; services/media/videoProcessing.service.ts. Track/delete all derived object keys with retry support. |
| N8 | Medium | Media processing failures never trigger the advertised BullMQ retries. Video/audio processors catch errors, set FAILED and resolve; the worker therefore considers the job completed. Simply rethrowing also needs a state change because the handler currently skips any asset not UPLOADED. | services/media/videoProcessing.service.ts catch; audioProcessing.service.ts; queue/bullmq.queue.provider.ts attempts; workers/video.worker.ts. Probe confirms failed processing resolves normally. |
| N9 | High | Refresh-token rotation is not single-use under concurrency. Two requests can both read revokedAt=null, unconditionally update the old session, and each issue a new session. | services/auth.service.ts:81-100; repositories/authSession.repository.ts markUsedAndRevoke lacks a revokedAt=null condition. Probe reproduces two successful rotations of one token. Atomically claim the token and issue its successor in a transaction. |
| N10 | High | Password reset/change is not atomic. Password update, token consumption and session revocation execute through Promise.all. A failure can leave the password changed while the request returns an error and sessions remain usable. Two reset requests can also pass the unused-token read before either consumes it. | services/auth.service.ts:130-153; passwordReset.repository.ts markUsed is unconditional. Probe reproduces passwordChanged=true after session revocation throws. Use transactional token consumption/password update/revocation. |
| N11 | High | Chapter-file audiobooks mix chapter-local and whole-book time. The total becomes the current file's duration, jumpChapter seeks to a cumulative book offset in that individual file, onTimeUpdate resets progress to chapter-local time, and onEnded marks total reached instead of advancing the next chapter. | frontend players/AudiobookPlayer.tsx:44,216-226,274-280. Fix chapter indexing, local offsets, overall progress and automatic continuation together. |
| N12 | High | Real plan choices disappear or get invalid prices. Public plans return price and omit active (the endpoint already filters active plans); the frontend reads priceAmount and filters p.active, removing every returned choice and otherwise producing NaN prices. | backend services/billing/plan.service.ts toCustomerPlan; frontend hooks/useApiPlans.ts planPriceDollars; routes/_site.subscription.tsx:125. Define and map the actual public-plan DTO. |
| N13 | High | PlayerGate fetches the real subscription but never uses its result for the decision. It still calls useGate, which reads browser-local profile, subscription and age confirmation. Legitimately subscribed users can be blocked by demo state before reaching authoritative playback authorization. | frontend components/sv/players/PlayerGate.tsx:17-19; components/sv/Gate.tsx. In real mode, render from server access decisions rather than local demo restrictions. |

### Completed verification from the previous pass

- Backend: **510 tests passed across 66 files**, output in recheck-backend-tests.log.
- Frontend: **103 passed, 5 timed out, 2 worker-start errors**; only 13 files executed. This was not a passing run. Output in recheck-frontend-tests.log.
- New isolated review checks: **7/7 reproduced the targeted defects** with `node review-probes.cjs`.
- The broad passing backend suite does not cover these failure paths sufficiently and uses fake database/provider behavior. It cannot prove production readiness.
- No zero-bug guarantee is possible. Current inventory: **40 findings/risk groups**, plus the explicitly listed incomplete features and verification limits. Related symptoms are grouped, so this is not a count of every affected line or screen.


## Recheck — 2026-10-16

- Database SELECT 1 still succeeds.
- All seven isolated defect probes still reproduce their recorded faulty behavior. Passing these characterization probes means the bugs remain, not that the application passes correctness tests.
- Rechecked registration/reset payloads, payment-method routes, checkout redirect, movie DTO mapping/playback, local player gate, subscription userId uniqueness, webhook pending handling and HLS path construction: the previously documented issues in these paths are still present.
- The player icon/encoding repair remains in place; no mojibake markers were found in the player components.
- This was a targeted status recheck, not a new full build/test run or proof that every one of the 40 entries is unchanged. No application code was modified during this recheck.
