# StreamVerse frontend and backend review

Reviewed 2026-10-12. Static review of application structure, frontend state and routes, backend middleware, domain services, Prisma schema/migrations, billing, storage, media processing and test strategy. This is a repository review; no production infrastructure or live provider account was inspected. No application fixes were made.

## Architecture

Frontend: React 19, TypeScript, TanStack Start/Router, Tailwind, Radix components, customer and admin routes. Catalog/settings use src/lib/store.ts; customer state uses src/lib/user.ts; browser persistence uses src/lib/persisted.ts; uploaded media uses IndexedDB. Wizards, content restrictions, notifications, payment interfaces, legal editing and players are substantial UI implementations.

Backend: Express, Zod, Prisma/PostgreSQL, JWT and Argon2 authentication, layered routes/controllers/services/repositories, S3-compatible storage, ffmpeg media processing, BullMQ/Redis, Stripe billing. Customer catalog/activity and admin content/media/billing APIs exist. Tests exercise real HTTP handlers but substitute an in-memory Prisma implementation and fake Stripe/media processors.

## Findings, ordered by priority

1. HIGH — Frontend and backend are not integrated. Frontend catalog, profile, roles, subscriptions, progress and admin edits remain browser-local; no application API client or customer HTTP requests were found. See streamverse/src/lib/store.ts, user.ts, persisted.ts, routes/admin.tsx and components/sv/BackendNotice.tsx. Demo mode defaults on in lib/demo.ts. The UI is a prototype; hiding the role switch does not establish authentication. Implement API-backed auth/session handling and server-owned data before treating the site as a working service.

2. HIGH — Private movie HLS delivery cannot authorize child requests. services/mediaAccess.service.ts signs only the master manifest. services/media/videoProcessing.service.ts writes relative variant playlist references, while storage/s3.storage.provider.ts presigns individual GetObject requests. Those signatures do not authorize variant playlists or segments. Playback will fail against private storage; making the media public would bypass subscriber gating. Use signed CDN cookies/tokens scoped to the asset prefix, or an authenticated delivery layer which rewrites/signs all required playlist and segment URLs. Verify actual playback with private storage.

3. HIGH — Invoice parsing is incompatible with the installed Stripe invoice types. services/billing/payment.service.ts:72 and :76 cast invoices to obsolete top-level subscription/payment_intent fields. The installed SDK declares parent.subscription_details and InvoicePayment.payment.payment_intent instead. Current invoice payloads can produce unlinked payments without a PaymentIntent, causing refundPayment to reject refunds. tests/integration/billing.webhooksRefunds.test.ts constructs the obsolete shape, masking this. Use the configured API version's actual event fixtures and resolve invoice payment references explicitly.

4. HIGH — Subscription synchronization permits stale state to overwrite newer state. services/billing/subscription.service.ts:47-71 blindly upserts each snapshot by userId, and stripeWebhook.service.ts passes event snapshots directly. An older ACTIVE event arriving after cancellation can restore access; an old subscription's event can replace the user's newer subscription. Reapplying identical snapshots is idempotent, but does not make different, out-of-order snapshots safe. Reconcile authoritative state and serialize updates with subscription identity/order safeguards.

5. HIGH — Payment events can regress terminal states. services/billing/payment.service.ts skips only matching status. A delayed invoice.payment_failed can overwrite a SUCCEEDED or REFUNDED payment; a delayed invoice.paid can overwrite refund status. Preserve settled/refunded state and derive current state from authoritative invoice/refund information. Add reversed-order event tests.

6. HIGH — Unknown country bypasses territory restrictions. services/contentAccess.service.ts:87 returns unrestricted when userCountry is absent. Anonymous customers and accounts with null country can consume region-limited public titles. Country is also editable via validators/user.validator.ts. Decide whether territory is a preference or enforceable licensing rule; for enforceable restrictions use trusted location evidence and deny unknown locations.

7. MEDIUM — Multiple checkout sessions can produce multiple billable subscriptions. services/billing/subscription.service.ts:137 checks only an already-synchronized active subscription and generates a fresh random idempotency key for every request. Two checkouts before webhook synchronization both pass. Reserve/reuse pending checkout state per user and reconcile duplicate completions.

8. Stripe Customer creation uses a stable provider idempotency key (customer-create-{userId}) in services/stripe/stripe.service.ts. This mitigates simultaneous creation; no duplicate-customer defect is asserted.

9. MEDIUM — Webhook deduplication does not claim processing atomically. controllers/webhook.controller.ts reads then creates, and allows dispatch of existing PENDING rows. Concurrent deliveries can dispatch twice or hit a unique constraint. Use an atomic processing claim/lease and transactional or independently idempotent side effects.

10. MEDIUM — Changing a plan's Stripe Price can break synchronization of existing subscribers. subscription.service.ts:74 resolves prices only from the current Plan.stripePriceId. After replacing that value, events for subscriptions still using the previous price cannot find a plan. Retain immutable price mappings or use the existing subscription's historical mapping.

## Known incomplete features and test limitations

- Password reset email delivery is a console stub; services/email.service.ts deliberately sends nothing in production.
- Malware scanning returns NOT_CONFIGURED in services/media/malwareScan.service.ts.
- Scheduled titles require explicit publication; contentAccess.service.ts documents no automatic scheduler.
- Logout/password changes revoke refresh sessions, while issued access JWTs remain valid until expiry unless the account is disabled. This is documented in README.md.
- tests/fakePrisma.ts does not implement transactional rollback or database concurrency. Passing integration tests cannot prove race safety, real PostgreSQL constraints or migration behavior.
- Live Stripe, real ffmpeg, private S3 HLS playback and deployed CORS/cookie behavior need end-to-end verification.
- Frontend legal content still includes unresolved business placeholders in lib/legal-content.ts.

## Strengths

Backend authorization checks active account state and role against the database. Admin routes centralize role protection. Stripe webhook verification receives the raw body. Customer media access runs through shared content-access rules. Content relationships use stable IDs, content deletion is soft, legal drafts and published versions are separated, and storage/queue/provider abstractions support focused testing.

## Recommended sequence

Fix private HLS delivery and Stripe payload/order correctness first. Add real PostgreSQL and realistic provider integration coverage. Connect authentication and catalog, then admin mutations/uploads, customer activity and billing. Remove production demo state, configure real email and worker services, resolve legal placeholders, and run deployed end-to-end flows before launch.

## Additional media/worker findings

- HIGH: QUEUE_DRIVER defaults to inline, but only workers/start.ts registers processing handlers. The API and worker run in separate processes, so the API's in-memory handler map remains empty and enqueue logs a warning then drops the job. Use BullMQ for separate API/worker processes, or explicitly initialize inline processors in the API during development.
- MEDIUM: services/media/reconciliation.service.ts always selects the oldest READY rows without advancing a cursor or updating checked rows. When those rows exist, repeated calls check the same batch and can miss all later assets indefinitely. Add a persisted cursor or lastCheckedAt scheduling.

## Verification

- Frontend production build: passed, including client, SSR and Nitro output.
- Backend TypeScript production build: passed.
- Frontend lint: failed with 7,946 errors and 51 warnings. Many errors are CRLF formatting; additional hook-rule errors occur in route components.
- Backend full test run: 363 passed, 1 timed out (364 total, 45 files). The affected billing.subscription.test.ts file passed all 9 tests when rerun alone; the original timeout is not a confirmed logic defect.
- Frontend initial test run: 111 passed, 7 failed, with 3 additional worker startup errors. JSDOM canvas and HTML nesting warnings were reported. These results are affected by worker/resource timeouts; a limited-worker rerun is used to assess reproducibility.

- Frontend rerun with two workers: 199 passed, 3 timed out (202 tests across 15 files); no worker startup errors. Remaining timeouts: admin catalog sorting, audiobook play/speed/sleep timer, and movie wizard derived values. These are unresolved verification failures, not demonstrated functional defects. Full rerun output is in frontend-tests-limited.log.
