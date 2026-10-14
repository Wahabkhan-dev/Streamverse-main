# StreamVerse API

Node.js + TypeScript + Express + Prisma (PostgreSQL). Two roles only: `USER` and `ADMIN`.

Status: **Phase 7 (Stripe billing)** complete. Production analytics and final entitlement/DRM hardening
(Phase 8) still come later. This phase adds subscription plans, Stripe Checkout/Billing Portal, payment
methods via Stripe Elements, subscription lifecycle (checkout/cancel/resume/change-plan), billing history,
admin payments/refunds, signature-verified idempotent webhooks, and wires real Stripe-backed subscription
state into `contentAccess.service.ts` — replacing the Phase 5 placeholder everywhere it was used.

## Run locally

```bash
cp .env.example .env          # then edit values
npm run db:up                 # PostgreSQL + Redis via Docker (optional Redis)
npm run prisma:generate
npm run prisma:migrate        # applies prisma/migrations against your database
npm run prisma:seed           # creates the first ADMIN — see "Admin bootstrap" below
npm run dev                   # http://localhost:4000
npm test
```

- Liveness: `GET /health` · Readiness (checks the database): `GET /ready`
- API docs (not in production unless `API_DOCS_ENABLED=true`): `GET /api/v1/docs`

## Request flow

`route → controller → service → repository → database`. Routes attach middleware, controllers read the request and send the
response, services hold business rules, and only repositories touch Prisma.

## Conventions

- All APIs live under `/api/v1`. Responses use one envelope: `{ success, message, data }`, lists add `pagination`, errors are `{ success: false, message, errors[], code, requestId }`.
- Validate every body/params/query with Zod through `validate()`; unknown fields are stripped (this is also the
  mass-assignment guard — a client cannot set `role`, `status`, `passwordHash`, etc. by sending extra fields).
- Sorting is whitelisted through `listQuery()`.
- Never log or return secrets; the logger redacts passwords, tokens and card fields.

## Authentication

One strategy: a short-lived JWT **access token**, returned in the response body and sent as
`Authorization: Bearer <token>`, plus a rotating **refresh token** kept in an httpOnly cookie
(`sv_refresh_token`, path `/api/v1/auth`, `SameSite=Lax` by default, `Secure` in production). The access
token is never stored in a cookie and the refresh token is never readable from JavaScript or returned in a
response body.

- `requireAuth` verifies the access token, then re-loads the account from the database on every request —
  a token's `role` claim is never trusted by itself, and a suspended/deleted account is rejected immediately
  even on an unexpired token.
- `requireRole("ADMIN")` runs after `requireAuth`: 401 if nothing authenticated the request, 403 if it did
  but the role doesn't match.
- Refresh tokens rotate: each use revokes the presented token and issues a new one. Presenting an
  already-used (rotated or logged-out) token is treated as theft and revokes every session on the account.
- `POST /auth/change-password` and `POST /auth/reset-password` both revoke every session for the account
  (change-password includes the session making the request) — the person logs in again afterwards. This is
  a deliberate choice, not an oversight: see `src/services/auth.service.ts`.

**CSRF posture**: state-changing requests (register, login, logout-all, change-password, profile update,
and everything content-related in later phases) are authenticated with a bearer token in the
`Authorization` header, which browsers never attach automatically cross-site — so CSRF does not apply to
them. Only `/auth/refresh` and `/auth/logout` rely on the cookie alone, and both are narrow by design
(refresh only rotates/extends a session's own token; logout only ends it), so a forged cross-site request
to either does not let an attacker read or change anything.

### Admin bootstrap

There is no API endpoint that creates an ADMIN — `POST /auth/register` always creates a `USER`. To create
the first admin, set three variables (in `.env`, or inline) and run the seed:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=a-long-random-password ADMIN_NAME="Site Admin" npm run prisma:seed
```

Idempotent — running it again does nothing if that email already has an account. There is no built-in way
to promote a second admin; do it directly against the database.

### Known limitation

An access token is a stateless JWT: revoking sessions (logout, logout-all, password change/reset) stops
**refresh** immediately, but an already-issued access token keeps working until its own short expiry
(`ACCESS_TOKEN_TTL`, default 15 minutes) — there is no server-side access-token revocation list in this
phase. Keep `ACCESS_TOKEN_TTL` short; a true "kill this session right now" guarantee would need one
(deferred, noted for a later phase rather than built speculatively here).

## Testing without a reachable PostgreSQL

Integration tests run the real `route/service → repository` chain against an in-memory fake Prisma client
(`tests/fakePrisma.ts`), injected in place of `src/config/database` with `vi.mock`. Only the database
network call is replaced. The fake now also supports `include`, `createMany`, `upsert`, unique-constraint
errors (`code: "P2002"`) and a (non-rolling-back) `$transaction` — enough to exercise Phase 3's
relationships and constraints, but it is not Postgres: row-level locking and real transactional rollback
are not actually tested here. Swap this out for a real test database in CI when one is reachable.

Phase 6 follows the same philosophy for the two other things this sandbox doesn't have: real S3 and
ffmpeg. Tests run `STORAGE_PROVIDER=local` (the real local-filesystem adapter behind `StorageProvider` —
not a mock; actual bytes get PUT through `/dev/storage/...` and read back), and `services/media/index.ts`'s
`getMediaProcessor()` is swapped via `vi.mock` for `tests/fakes/mediaProcessor.fake.ts`, the one piece that
would otherwise need a real ffmpeg binary.

## Core content database (Phase 3)

One `Content` row per title (movie, eBook or audiobook) — see `prisma/ERD.md` for the full relationship
map. The short version:

- **Stable identity**: `Content.id` is what every relationship (genres, tags, languages, homepage,
  collections, banners, and My List/Library/History in a later phase) points at — never a slug or a copied
  title/cover. `contentCode` (`MOV-000001`, ...) is permanent and never reused, even across deletes
  (`ContentSequence`, incremented atomically; see `contentCode.service.ts`). `slug` can be edited later
  without touching any relationship.
- **Drafts are valid rows**: nothing below the Zod-validator layer requires more than a `title`. Publish
  readiness (needs a genre, a file, a cover, ...) is a business rule for Phase 4 to enforce, not a
  database constraint — see `content.validator.ts`'s module comment.
- **Soft delete only**: `Content.deletedAt`; nothing in this phase hard-deletes a title.
- **Genres/tags/languages** are admin-managed rows with stable ids; renaming one never breaks a
  relationship (`genre.service.ts` renames in place, `tag.service.ts` normalizes so the same tag is never
  created twice).
- **Legal documents** keep the published and draft text as separate `LegalDocumentVersion` rows
  (`legal.service.ts`): saving a draft never changes what customers would see; only `publishDraft` does.
- **Homepage sections, collections and banners** have their schema in place (Section 38) but no admin
  API yet — that's Phase 4.

### Frontend → database field map

| Frontend field | Database |
| --- | --- |
| Movie/Book `.title`, `.slug`, `.description`, `.status`, `.releaseDate`, `.cid` | `Content.title` / `.slug` / `.description` / `.status` / `.releaseDate` / `.contentCode` |
| `restrictions.access` (Public/Subscribers Only/Hidden) | `Content.visibility` |
| `restrictions.ageRestricted`, `.minAge` | `Content.ageRestricted`, `.minimumAge` |
| `restrictions.territory`, `.countries` | `Content.territoryMode`, `ContentTerritory.countryCode` |
| `restrictions.availableFrom/Until` | `Content.availableFrom` / `.availableUntil` |
| `restrictions.warnings[]` | `ContentWarning` → `ContentWarningType` |
| `promo.featured/trending/popular/newRelease` | `Content.featured/trending/popular/newRelease` |
| Movie `.genres[]` / Book `.genre` | `ContentGenre` → `Genre` |
| `info.tags[]` | `ContentTag` → `Tag` |
| Movie `.runtime`, `.cast[]`, `info.director/producer` | `Movie.runtimeMinutes`, `MovieCast`, `MovieCrew` (role `DIRECTOR`/`PRODUCER`) |
| Movie `info.audio[]`, `.subtitles[]` | `MovieAudioTrack` / `MovieCaption`, each → `Language` |
| Book `.author`, `.narrator`, `.isbn`, `.series` | `Ebook`/`Audiobook` `.author`/`.narrator`/`.isbn`/`.series` |
| Book `info.languages[]`, narrator per language | `EbookEdition` / `AudiobookEdition` → `Language` |
| Audiobook chapters | `AudiobookChapter` |
| Homepage section items / Collection items / Banner link | `HomepageSectionItem.contentId` / `CollectionItem.contentId` / `Banner.linkedContentId` |
| Legal admin draft vs published | `LegalDocument.currentDraftVersion` vs `.currentPublishedVersion` |
| Admin Settings toggles | `AppSetting` (one row per key) |

## Admin content APIs (Phase 4)

Everything under `/api/v1/admin` requires `requireAuth` + `requireRole("ADMIN")`, applied once in
`routes/admin.routes.ts` — no controller repeats that check.

- **Movies/eBooks/audiobooks**: `POST` (title-only draft is valid), `GET`/`PUT`/`PATCH`/`DELETE` on `/:id`
  (PUT and PATCH are the same partial-update handler — see `updateXSchema`'s module comment), plus
  `publish`/`unpublish`/`archive`/`schedule`/`cancel-schedule`. eBooks and audiobooks also get
  `/:id/editions`; audiobooks also get `/:id/chapters` (+ `/reorder`).
- **Relation arrays** (`genreIds`, `tagIds`, `languages`, cast/crew/captions/audio tracks) **replace** the
  current selection when sent, and are left untouched when omitted — an autosave loop that resends the
  same array never creates duplicates.
- **Publish validation** (`contentPublishValidation.service.ts`) is the one place that decides
  readiness per type; `POST .../publish` returns 400 with field-level errors (`{ path, message }`, the
  same shape every other validation error in this API uses) when something required is missing.
- **Status transitions** (`contentStatus.service.ts`) enforce one allowed-transition table for every
  content type. `cancel-schedule` always returns to `DRAFT` (documented choice — a scheduled title was
  never actually published). `ARCHIVED` is terminal in this phase.
- **Media asset references**: Admin attaches an *existing* `MediaAsset` id to a named slot (e.g.
  `movie.posterAssetId`); the reference is checked for existence and type before it's saved. No upload
  happens here — that's Phase 6.
- **Optimistic concurrency**: every update/status-change body accepts an optional `expectedUpdatedAt`; if
  the row moved on since the client last read it, the request gets 409 instead of silently overwriting.
- **Genres**: delete is refused (409) while any title still uses the genre; deactivate (`active: false`)
  via update instead.
- **Collections**: "delete" sets `status: ARCHIVED` — there is no `deletedAt` on `Collection`, so nothing
  is ever actually removed.
- **Audit log**: every create/update/status-change/delete across content, genres, collections, homepage,
  banners, legal and settings writes one `AuditLog` row (actor, action, entity, metadata, IP, user agent,
  request id). Settings updates log `oldValue`/`newValue`.

## Customer-facing APIs (Phase 5)

Everything below is driven by one rule, enforced in a single place (`contentAccess.service.ts`): a title is
customer-visible only when `status=PUBLISHED`, not soft-deleted, `visibility≠HIDDEN`, and inside its
availability window; `evaluateAccess()` layers subscription/age/territory checks on top and returns
`{canViewMetadata, canConsume, reason?}`. No other service re-implements this check.

- **Catalog & detail**: `GET /movies|/ebooks|/audiobooks` (filter/search/paginate, published-only) and
  `GET /.../:slug`. A detail route 404s identically for an unknown slug and for a real-but-not-visible one
  (Section 67) — existence of hidden/removed content is never confirmed either way. `optionalAuth`
  personalizes `access` when a bearer token is sent, but every discovery route also works with none.
- **Search**: `GET /search` (title, genre, cast/crew, author/co-author, narrator — one Prisma-safe `OR`,
  query capped at 100 chars) and `/search/suggestions` (max 8, lightweight). `type=PEOPLE` groups matches by
  name+role with their titles. Both are rate-limited (`searchLimiter()`).
- **My List / Library** (`/me/my-list`, `/me/library`): add is an upsert (idempotent), remove is a safe
  no-op if absent, and a saved item that stops being customer-visible is silently dropped from the list —
  never shown broken, never an error.
- **Progress** (`/me/progress/movie|ebook|audiobook/:id`): movie/audiobook percentage is derived
  server-side from `positionSeconds/durationSeconds`; eBook percentage is client-supplied (page/location
  aren't convertible server-side). Completion uses one named threshold (`COMPLETION_THRESHOLD_PERCENT = 95`,
  `constants/progress.ts`) everywhere, never a scattered magic number.
- **History** (`/me/history`): one upsert-touched row per user+content (never one row per tick); removing
  an item only hides it (`removedAt`) and leaves progress untouched — re-accessing the title un-hides it
  automatically.
- **Bookmarks** (`/me/ebooks/:ebookId/bookmarks`): multiple per eBook allowed. Deleting someone else's
  bookmark 404s, not 403s — same information-leak reasoning as the detail-route 404 policy.
- **Notifications** (`/me/notifications`): list responses include `unreadCount` alongside `pagination`.
  Cross-user access to another account's notification 404s.
- **Homepage / Collections / Banners** (`GET /homepage`, `/collections`, `/banners`): enabled sections only,
  in order; MANUAL sections read curated items, DYNAMIC ones (`FEATURED`/`TRENDING`/`POPULAR`/`NEW_RELEASE`)
  derive straight from `Content` flags — nothing is duplicated between the two. A banner whose linked
  content is no longer visible is dropped entirely, not shown unlinked or broken (documented choice,
  Section 16, matching the frontend's existing behavior).
- **Customer legal reads** (`GET /legal/privacy-policy|terms-and-conditions|refund-policy`): only
  `currentPublishedVersion` is ever returned; a draft never leaks, and "nothing published yet" is a 404, not
  an empty/draft fallback.
- **Related content** (embedded in detail responses): scored by shared genres (×3) / tags (×2) / languages
  (×1) against other customer-visible titles of the same type, capped at 12.
- **Mixed cards**: collections, homepage, related content, My List, Library, History and search's `ALL` tab
  all return the same type-agnostic card shape (`toMixedCards`, `mixedContent.service.ts`), resolved via 3
  batched queries — never one query per item.
- **Dev-only access placeholders** (documented, not hidden): `User.hasActiveSubscriptionDev` defaults
  `false` and `User.ageVerifiedAt` defaults `null` — both stand-ins for Phase 7 (Stripe) / a future
  age-verification flow, deliberately defaulting to the *most restrictive* state so `SUBSCRIBERS_ONLY`/
  age-restricted logic is actually exercised instead of silently bypassed.
- **Customer vs admin DTOs** are separate mapper modules end to end — customer responses never include a
  raw `storageKey`, only opaque `*AssetId` references, and `rating`/`reviewCount` are `null`/`0` (no rating
  model exists yet — the frontend's placeholder 4.5 rating was not carried into the backend).

### Frontend → customer API map

| Frontend need | Endpoint |
| --- | --- |
| Browse/filter movies, eBooks, audiobooks | `GET /api/v1/movies` / `/ebooks` / `/audiobooks` |
| Title detail page | `GET /api/v1/movies/:slug` (+ `/ebooks`, `/audiobooks`) |
| Search bar + suggestions | `GET /api/v1/search`, `/api/v1/search/suggestions` |
| Home page rows | `GET /api/v1/homepage` |
| Collection/curated page | `GET /api/v1/collections`, `/api/v1/collections/:slug` |
| Hero/promo banners | `GET /api/v1/banners` |
| My List add/remove/view | `POST`/`DELETE`/`GET /api/v1/me/my-list` |
| Library (owned/purchased) | `POST`/`DELETE`/`GET /api/v1/me/library` |
| Resume watching/reading/listening | `GET /api/v1/me/continue`, `/api/v1/me/progress/...` |
| Watch/Read/Listen history | `GET /api/v1/me/history` |
| eBook reader bookmarks | `/api/v1/me/ebooks/:ebookId/bookmarks` |
| Notification bell | `/api/v1/me/notifications` |
| Privacy/Terms/Refund pages | `GET /api/v1/legal/privacy-policy` (+ `terms-and-conditions`, `refund-policy`) |

### Remaining limitations (by design, not oversight)

- No real subscription state yet — `hasActiveSubscriptionDev` is a development placeholder until Stripe
  (Phase 7).
- No age-verification flow yet — `ageVerifiedAt` is set only by test/seed code until that flow exists.
- No geolocation — territory restriction logic exists and is tested, but nothing populates a real
  `userCountry` yet.
- No rating/review model — `rating`/`reviewCount` are hardcoded `null`/`0` everywhere.
- No AI recommendations — "related content" is a deterministic genre/tag/language score, not a model.
- Real uploads, media processing and protected playback are built in Phase 6, below.

## Object storage, uploads and media processing (Phase 6)

### Storage architecture

One interface, `StorageProvider` (`services/storage/storage.provider.ts`), with two implementations
behind `getStorageProvider()`:

- **S3-compatible** (`s3.storage.provider.ts`, AWS SDK v3): works against AWS S3, Cloudflare R2,
  Backblaze B2 and DigitalOcean Spaces unchanged — all four speak the same API. Set `AWS_ENDPOINT` (and
  usually `AWS_FORCE_PATH_STYLE=true`) for anything but AWS itself.
- **Local filesystem** (`local.storage.provider.ts`, `STORAGE_PROVIDER=local`, the default): a dev-only
  adapter behind the identical interface. "Presigned" URLs are real HMAC-signed, short-lived tokens served
  by `routes/localStorage.routes.ts`, mounted only when `NODE_ENV !== "production"` — nothing in business
  logic ever branches on which provider is active.

**Private-by-default policy** (Section 4): poster/backdrop/thumbnail/banner/eBook-and-audiobook-cover
images are the only assets ever served from a public URL (`isPublicPurpose()` in `constants/upload.ts`,
and `getPublicUrl()`/`MEDIA_BASE_URL` for a CDN in front of them). Everything else — movie masters, HLS
manifests/segments, eBook/audiobook files, captions — is private: every read of it goes through a
short-lived signed URL from `getStorageProvider().createDownloadUrl()`, never a permanent link.

### Upload purpose = MediaAssetType

Phase 3/4 already established `MediaAssetType` as the one per-slot kind of media asset. Rather than invent
a second, overlapping "purpose" enum, `UploadPurpose` (`constants/upload.ts`) IS that same type — one
source of truth, documented in `PURPOSE_RULES`: which `ContentType` each purpose is valid for, whether it
needs a `contentId`/`languageId`/`chapterId`, its MIME allowlist, its size limit, and (for images) its
minimum dimensions.

### Presigned upload flow

```
POST /api/v1/admin/uploads/presign           — validates everything, creates a PENDING/UPLOADING MediaAsset, returns a signed PUT (never the storageKey)
  (frontend PUTs the file directly to that URL)
POST /api/v1/admin/uploads/:assetId/complete — HEADs the object (never trusts "done" alone), magic-byte/structure-validates it, marks UPLOADED/READY, enqueues processing if needed. Idempotent.
POST /api/v1/admin/uploads/:assetId/abort    — cancels a pending upload: best-effort object delete, no orphan row
GET  /api/v1/admin/uploads/:assetId/status   — pollable status; never includes the storage key
```

Storage keys (`services/media/storageKey.service.ts`) are `content/{contentId}/{kind}/{uuid}.{ext}` —
always a generated UUID, the extension derived from the (allowlisted) MIME type, never the client's
filename (kept only as sanitized metadata).

Multipart upload (large movie masters) mirrors the same validation under
`/api/v1/admin/uploads/multipart/{initiate, :uploadId/part, :uploadId/complete, :uploadId}` (DELETE to
abort).

### Upload validation

- **MIME + size**: one central table (`constants/upload.ts`) — never re-declared per controller.
- **Magic bytes, not just the Content-Type header** (`services/media/`): `imageInspector.ts` reads real
  PNG/JPEG/WebP dimensions from the file's own bytes (no image library needed) and enforces each purpose's
  minimum quality bar; `epubValidator.ts` parses just enough of the ZIP central directory to confirm a
  real, non-zip-bomb EPUB with `META-INF/container.xml` present (entry-count and uncompressed-size
  guarded); `pdfValidator.ts` checks the `%PDF-`/`%%EOF` markers and derives a best-effort
  `detectedPageCount` (a heuristic, never silently overwriting an Admin-provided `pageCount`);
  `captionValidator.ts` requires real VTT/SRT cue timestamps and rejects an empty or malformed file.
- **Malware scan hook** (`malwareScan.service.ts`): a real architecture seam, honestly reporting
  `NOT_CONFIGURED` rather than pretending a scan ran. Wiring up a real scanner later means implementing
  one function.
- SVG is never an accepted image MIME type (Section 77 — XSS risk).

### Media asset lifecycle

`MediaAssetStatus`: `PENDING → UPLOADING → UPLOADED → PROCESSING → READY | FAILED`, plus `MISSING`
(reconciliation found the object gone) and `DELETED` (replaced/aborted, pending physical cleanup). Publish
readiness (`contentPublishValidation.service.ts`) now checks each required slot is **READY**, not merely
that an id was set — a database row existing is not the same as the file being ready.

### Movie master → HLS pipeline

One master file, uploaded once. `services/media/videoProcessing.service.ts` (off a queue, never inside a
request): probes the source (`MediaProcessor.probe`), picks only the renditions the source resolution
actually supports (`selectRenditions` — never upscales 1080p into a fake 4K), transcodes each one to HLS,
and writes a master playlist referencing them. Each rendition is its own `MediaAsset` row
(`sourceAssetId` pointing at the master, `variant`/`bitrate`/`resolution`/`codec`); the master's own row
gets `hlsManifestKey` once everything succeeds. Idempotent: re-running the job for an asset that isn't
`UPLOADED` no-ops, and a retry clears any renditions a previous partial attempt already wrote before
redoing them. On failure the master is marked `FAILED` with a sanitized error (never leaking a signed
source URL) and `POST /api/v1/admin/media/:assetId/retry-processing` re-enqueues it.

`MediaProcessor` (`services/media/mediaProcessor.provider.ts`) is the one seam to ffmpeg/ffprobe
(`ffmpeg.mediaProcessor.ts`, shelling out via `child_process`) — the worker process checks both binaries
are reachable at startup and exits immediately, loudly, if not (`assertFfmpegAvailable()`).

### Audio processing

`services/media/audioProcessing.service.ts` extracts duration/codec/bitrate/channels/sample rate for
audiobook files and movie audio tracks — metadata only, no transcoding (the single uploaded file is what
gets delivered). If extraction fails, `durationSeconds` stays `null`; nothing here ever invents a fallback
value.

### Captions

VTT/SRT, validated structurally on upload; `convertSrtToVtt()` is available to normalize SRT to VTT for
web playback. Every caption asset's language/type is validated the same way Phase 4 already validates
every other named slot (`assertAssetRef`).

### Media attachment, replacement and ownership

The actual slot wiring (`Movie.posterAssetId`, `Ebook.epubAssetId`, ...) still happens through the
existing Phase 4 admin update endpoints — `assertAssetRef` (`mediaAsset.service.ts`) now additionally
requires the asset to be **READY** and, if it was uploaded for a specific content row, that it's the SAME
row (Section 100: an asset uploaded for Movie A can never be wired into Movie B). A dedicated
`POST /api/v1/admin/content/:contentId/media/:assetId/attach` exists purely to let the Admin UI check
attachability without mutating anything.

**Replacement** (Section 44/45/68): when an update swaps a slot to a new asset id, the new reference is
live immediately (a single row update) and the OLD asset is marked `DELETED` with a grace period — never
destroyed before the switch, and never left dangling after it. `GET /api/v1/admin/content/:contentId/media`
lists everything attached to a content row; `DELETE /api/v1/admin/media/:assetId` refuses (409) to delete
an asset still wired into **published** content.

### Background jobs

`QueueProvider` (`services/queue/`): `bullmq` (Redis-backed, exponential-backoff retries, failed jobs kept
visible) or `inline` (the default — an explicit, documented dev/test fallback that runs a job's handler on
the next tick, never silently synchronous-in-request). Three queues: `video-processing`,
`audio-processing`, `media-cleanup`. Job payloads are IDs only, never file buffers.

`src/workers/start.ts` is the worker process's own entrypoint (`npm run worker`) — it fails loudly at
startup if ffmpeg is missing, `QUEUE_DRIVER=bullmq` has no `REDIS_URL`, or `STORAGE_PROVIDER` is
misconfigured, then registers the three processors and schedules an hourly cleanup/reconciliation run.

### Cleanup and reconciliation

`services/media/mediaCleanup.service.ts`: removes expired `PENDING`/`UPLOADING` rows whose presign TTL
passed with nothing ever uploaded, and removes `DELETED` rows past their grace period — but only after
re-checking, at cleanup time, that nothing still references the row (never trusts the status flag alone).
`services/media/reconciliation.service.ts`: a bounded, paginated batch job that marks a `READY` asset
`MISSING` if its object has vanished from storage — Admin sees "re-upload required" instead of customers
hitting a dead signed URL.

### Private media access foundation

```
POST /api/v1/media/movies/:contentId/playback       — requireAuth. Signed HLS manifest URL when eligible and processed.
POST /api/v1/media/audiobooks/:contentId/playback    — single-file or per-chapter signed URL(s), by delivery mode.
POST /api/v1/media/ebooks/:contentId/access          — signed URL for whichever of EPUB/PDF is READY.
```

Every one of these runs through the exact same `contentAccess.service.ts` rules every other customer read
already uses (`catalog.service.ts`'s `accessFor`, exported for reuse) — published/not-deleted/
visibility/age/territory/availability-window, plus real Stripe-backed subscription state as of Phase 7
(`subscriptionAccess.service.ts`, see below) — nothing changed at this call site when Stripe landed, exactly
as planned. A response never includes a storage key, bucket credential or permanent URL — only a signed
URL (`DOWNLOAD_URL_TTL_SECONDS`, default 10 minutes) or nothing, with a named `reason` when blocked.

### Logging & audit

Every upload/processing/delete/retry/playback-adjacent action logs `requestId`/actor/`assetId`/`contentId`
— never a presigned URL's query string or a storage credential. Admin actions (`media.upload_presigned`,
`media.upload_completed`, `media.deleted`, `media.processing_retried`, ...) also write an `AuditLog` row,
same as every other Phase 4 admin action.

## Stripe billing (Phase 7)

### Architecture

One Stripe client (`services/stripe/stripeClient.ts`), one wrapper module that is the ONLY thing allowed
to call it (`services/stripe/stripe.service.ts`) — every billing service goes through named functions
there (`createCustomer`, `createCheckoutSession`, `setSubscriptionCancelAtPeriodEnd`, `createRefund`,
`constructWebhookEvent`, ...), never the SDK directly. `config/stripe.config.ts` pins the API version to
exactly what the installed SDK expects. Tests `vi.mock` `stripe.service.ts` the same way Phase 6 mocked
storage/ffmpeg — `tests/fakes/stripeService.fake.ts` is the in-memory stand-in, with `__createFakeCustomer`
/ `__createFakeSubscription` / `__buildEventBody` helpers to drive scenarios without a real network call.

### Stripe Customer strategy

Lazy creation (Section 6's preferred strategy): `stripeCustomer.service.ts`'s `getOrCreateStripeCustomer`
creates a Stripe Customer the first time a user takes ANY billing action (setup intent, checkout, ...),
never at registration, and writes it to `User.stripeCustomerId` (`@unique` — a race between two calls can
only ever produce a database error, never two silently-duplicated customers). Metadata is limited to
`streamVerseUserId` — nothing sensitive.

### Plans

Admin links an **existing** Stripe Price id to a `Plan` row (Section 11's "link existing Price" policy,
not "mint Products/Prices through this backend") — `priceAmount`/`currency` are stored locally so the
pricing list and checkout never need a live Stripe call. A pricing change means creating a NEW Stripe
Price and updating `Plan.stripePriceId`; historical Subscription/Payment rows keep whatever price/amount
they were created with (Stripe Price amounts are effectively immutable, and this backend never mutates
them retroactively). `active: false` retires a plan — never hard-deleted while any Subscription
references it. `GET /api/v1/plans` (public) returns only active plans' name/price/currency/interval/
features; `stripePriceId`/`stripeProductId` are never exposed to customers.

### Checkout

`POST /api/v1/me/subscription/checkout` accepts `{ planId }` ONLY — amount/currency/price are never read
from the request. The backend resolves the active Plan, gets-or-creates the Stripe Customer, and creates a
Checkout Session; the response is `{ checkoutUrl, sessionId }`. A second checkout while already
TRIALING/ACTIVE is refused (409, Section 76/77) — one current `Subscription` row per user, updated in
place across cancel/resume/change-plan rather than replaced. **Reaching `/success` proves nothing** — the
frontend's success page is never payment truth; `GET /me/subscription` only ever reflects state Stripe
itself confirmed, via the subscription-sync path below.

### Subscription lifecycle

- **Status**: mirrors Stripe's own subscription statuses (`TRIALING`/`ACTIVE`/`PAST_DUE`/`UNPAID`/
  `CANCELED`/`INCOMPLETE`/`INCOMPLETE_EXPIRED`/`PAUSED`) — never collapsed to a vague active/inactive pair.
- **Access**: `subscriptionAccess.service.ts` is the ONE place that decides which statuses grant protected
  access — currently `TRIALING` and `ACTIVE` only. **`PAST_DUE` does not grant a grace period** (a
  deliberate, documented choice — Section 15 frames this as optional, and this phase doesn't make that
  product call unilaterally).
- **Cancel** (`POST .../cancel`) always sets `cancel_at_period_end = true` — immediate cancellation is
  never exposed (Section 40). Access continues until the period actually ends and Stripe sends
  `customer.subscription.deleted`.
- **Resume** (`POST .../resume`) clears that flag, only while still before the period end.
- **Change plan** (`POST .../change-plan`) accepts `{ planId }` only, swaps the Stripe subscription item's
  price, and uses an EXPLICIT, documented proration policy: **`create_prorations`** (Section 43) — never
  Stripe's accidental default. The resulting amounts are whatever Stripe computes; this backend never
  calculates proration itself (Section 44).
- Every one of these applies the Stripe API response through ONE shared function,
  `applyStripeSubscriptionSnapshot()`, also used by the webhook handlers below — re-deriving local state
  from the Stripe object's own fields every time means replaying an old/duplicate snapshot is a harmless
  no-op (Section 62: never assumes webhook delivery order).

### Payment methods

Stripe `PaymentMethod` is the payment-instrument authority end to end — this backend never sees, stores,
or logs a card number/CVC. `POST /me/payment-methods/setup` returns a `SetupIntent` `clientSecret` for
Stripe Elements; `GET /me/payment-methods` returns brand/last4/expiry/`isDefault` only. Deleting a
payment method is refused (409) only when it is BOTH the default AND the last one AND an active/trialing
subscription exists to protect (Section 34/35) — otherwise always allowed. Every read/write is checked
against the caller's OWN Stripe Customer first (`assertOwnedByUser`) — a payment method id alone is never
trusted (Section 36).

### Billing history & payments

`Payment` rows are created ONLY from verified Stripe webhook data (`invoice.paid` / `invoice.payment_failed`
— Section 25/65/66), never from a frontend claim. `GET /me/payments` paginates the caller's own rows with
`{ date, amount, currency, status, plan, invoiceReference }`. Admin gets the same data with filters
(`GET /admin/payments`) plus a summary endpoint (`GET /admin/payments/summary`) whose every number —
`totalPayments`/`succeeded`/`pending`/`failed`/`refunded`/`revenueMinor` — is a live aggregate over the
`Payment` table (Section 53/107), never a hardcoded card.

### Refunds

Admin-only (`POST /admin/payments/:id/refund`, `{ amount?, reason? }`). Validates existence, prior success,
and the REMAINING refundable amount (total already refunded/pending, via the `Refund` table) before ever
calling Stripe — a frontend-supplied amount is checked, never trusted. Amount omitted = full refund of
whatever remains. The local `Refund` row is created `PENDING` and only promoted once Stripe's response (or
the later `charge.refunded` webhook) confirms it; `Payment.status` is re-derived from the sum of
`SUCCEEDED` refunds afterward (`REFUNDED` vs `PARTIALLY_REFUNDED`, never guessed).

### Webhooks

`POST /api/v1/webhooks/stripe` — mounted in `app.ts` with its OWN `express.raw()` parser, strictly before
the app's normal `express.json()`, so Stripe's signature check runs against the exact bytes it signed
(Section 19/20). Idempotent by `stripeEventId` (the `StripeEvent` table, `@unique`): a retried event whose
row is already `PROCESSED`/`IGNORED` is acknowledged without re-dispatching; one still `PENDING`/`FAILED`
is retried. All business logic lives in per-event-type handlers in `stripeWebhook.service.ts` — the
controller only verifies/persists/dispatches/responds (Section 23). Handled events:

- `checkout.session.completed` — looks up the resulting subscription and syncs it
- `customer.subscription.created` / `.updated` — syncs via `applyStripeSubscriptionSnapshot`
- `customer.subscription.deleted` — marks the local row `CANCELED`
- `invoice.paid` — creates/updates a `SUCCEEDED` `Payment`
- `invoice.payment_failed` — creates/updates a `FAILED` `Payment`
- `charge.refunded` — re-syncs `Refund`/`Payment` status for each refund on the charge
- `payment_intent.succeeded` / `.payment_failed`, `setup_intent.succeeded`, `payment_method.attached` —
  acknowledged (recorded in `StripeEvent`) with no additional local action, since `invoice.paid`/
  `invoice.payment_failed` already cover subscription billing and payment methods are always read live
  from Stripe rather than mirrored locally

Scope note (Section 64): dispatch runs synchronously within the webhook request rather than being
re-queued through Phase 6's `QueueProvider` — everything each handler does is fast, local-DB-bound work
(no outbound network calls of its own), so the "don't do huge work inside the webhook request" concern
doesn't actually apply here yet. Re-queuing remains straightforward to add if volume ever requires it.

### Reconciliation

`stripeReconciliation.service.ts`'s `reconcileUser(userId)` re-pulls the latest Subscription directly from
Stripe and re-applies it through the same snapshot function the webhooks use — protects against a missed
webhook or a "Stripe succeeded, local write failed" gap (Section 86: designed for eventual consistency,
not immediate perfection). Exposed only as `POST /admin/billing/reconcile/:userId` (internal/admin use,
Section 89) — never a public endpoint.

### Content access integration

`contentAccess.service.ts`'s `loadAccessUser()` now calls `subscriptionAccess.service.ts`'s
`hasActiveAccess(userId)` instead of reading the retired `User.hasActiveSubscriptionDev` placeholder
column — every other line in `contentAccess.service.ts`, and every caller of it (movie/audiobook/eBook
playback authorization from Phase 6), is unchanged. `SUBSCRIBERS_ONLY` content now gates on a real,
Stripe-synchronized subscription.

### Money

Amounts are integer minor units throughout (Stripe's own convention — `1999` for $19.99), never floats.
`utils/money.ts` centralizes which currencies don't use 2 decimal digits (JPY has 0, BHD has 3, ...) for
the one place a human-readable amount is ever derived; no low-level arithmetic assumes "divide by 100".

### Frontend → billing API map

| Frontend need | Endpoint |
| --- | --- |
| Pricing page | `GET /api/v1/plans` |
| Subscribe / change plan | `POST /api/v1/me/subscription/checkout` / `/change-plan` |
| Subscription page status | `GET /api/v1/me/subscription` |
| Cancel / resume | `POST /api/v1/me/subscription/cancel` / `/resume` |
| Stripe-hosted billing portal | `POST /api/v1/me/billing-portal` |
| Add payment method | `POST /api/v1/me/payment-methods/setup` (SetupIntent) → Stripe Elements → `GET /api/v1/me/payment-methods` |
| Set default / remove payment method | `POST /api/v1/me/payment-methods/:id/default`, `DELETE /api/v1/me/payment-methods/:id` |
| Billing history | `GET /api/v1/me/payments` |

### Remaining limitations (by design, not oversight)

- No tax calculation — architecture is Stripe-Tax-compatible later, nothing invented now (Section 73).
- No coupons/promo codes — out of scope for this phase (Section 74).
- No trial flow beyond what a Plan's linked Stripe Price itself configures (Section 75) — this backend
  does not invent a free trial.
- Webhook dispatch is synchronous in-request rather than queued (see Scope note above).
- `PAST_DUE` grants no grace period — a product decision left for later if needed (Section 15).

### Required Stripe env vars

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, and optionally
`STRIPE_PORTAL_RETURN_URL` — validated at startup, including a check that a live key isn't used outside
production and vice versa (Section 115). For local webhook testing, run the Stripe CLI
(`stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe`) and copy its printed signing secret
into `STRIPE_WEBHOOK_SECRET` — never hardcode a webhook secret (Section 90).
