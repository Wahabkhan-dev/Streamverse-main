# SQL Execution Log

## Format

Each entry records one SQL script execution:

| Field | Description |
|-------|-------------|
| Script | Filename |
| Purpose | What it does |
| Environment | Where it was run |
| Date | When it was run |
| Result | PASS / FAIL / PENDING |
| Notes | Any observations |

Credentials are NEVER recorded here.

---

## Log

### 2026-10-15 — MySQL migration baseline

| Script | Purpose | Environment | Date | Result | Notes |
|--------|---------|-------------|------|--------|-------|
| `local/001_mysql_initial_setup.sql` | Create streamverse_dev DB and user | Local dev | 2026-10-15 | PASS | Database `streamverse_dev` created, user `streamverse` granted full privileges |
| `verification/002_schema_precheck.sql` | Verify DB charset/collation/version | Local dev | 2026-10-15 | PASS | MySQL 8.0.46, utf8mb4, utf8mb4_unicode_ci confirmed |
| `verification/003_schema_verification.sql` | Verify all tables exist | Local dev | 2026-10-15 | PASS | 53 tables (52 app + _prisma_migrations), all InnoDB, all utf8mb4 |
| `verification/004_index_verification.sql` | Verify indexes | Local dev | 2026-10-15 | PASS | All unique/composite indexes present on all tables |
| `verification/005_data_integrity_checks.sql` | FK, dead fields, Plan entitlements | Local dev | 2026-10-15 | PASS | 0 dead fields, Plan entitlements verified (audiobooksEnabled, ebooksEnabled, features JSON, maxConcurrentStreams, maxDevices, maxVideoQuality, moviesEnabled) |
| `verification/006_post_migration_verification.sql` | Engine, charset, SQL mode, connection | Local dev | 2026-10-15 | PASS | STRICT_TRANS_TABLES enabled, all engines InnoDB, all charsets utf8mb4, Device/PlaybackSession/ContentSequence tables verified |

---

## Code Changes Applied — 2026-10-15

The following source code changes were made during the PostgreSQL → MySQL migration:

1. **`prisma/schema.prisma`**
   - `datasource provider`: `postgresql` → `mysql`
   - `Content.seoKeywords`: `String[] @default([])` → `Json @default("[]")`
   - `Plan.features`: `String[]` → `Json @default("[]")`
   - Added `@db.Text` on: `Content.summary`, `Content.description`, `AppSetting.value`, `Notification.message`, `MediaAsset.processingError`, `AuthSession.userAgent`, `AuditLog.userAgent`
   - Added `@db.LongText` on: `LegalDocumentVersion.content`
   - Added `@db.Text` on: `LegalDocumentVersion.seoDescription`

2. **`prisma/migrations/migration_lock.toml`**
   - `provider`: `postgresql` → `mysql`

3. **`prisma/migrations_postgres_archive/`**
   - All PostgreSQL migration folders archived here for reference

4. **`src/mappers/content.mapper.ts`**
   - Added `toStringArray()` helper for JSON→string[] cast
   - `seoKeywords` type changed to `unknown`, cast via `toStringArray()`

5. **`src/services/billing/plan.service.ts`**
   - `features` type changed from `string[]` to `unknown`, cast inline

6. **`src/repositories/search.repository.ts`**
   - Removed `mode: 'insensitive'` (PostgreSQL-only, not needed with MySQL utf8mb4_unicode_ci)
   - Fixed `contains: q as const` → `contains: q`

7. **`src/repositories/catalog.repository.ts`**
   - Removed `mode: 'insensitive'`

8. **`src/repositories/content.repository.ts`**
   - Removed `mode: 'insensitive'`

9. **`src/repositories/collection.repository.ts`**
   - Removed `mode: 'insensitive'`

10. **`src/repositories/subscription.repository.ts`**
    - Removed `mode: 'insensitive'`

11. **`.env.example`**
    - `DATABASE_URL` changed to MySQL format

12. **`docker-compose.yml`**
    - PostgreSQL 16 service replaced with MySQL 8.0 service

13. **`src/config/env.ts`**
    - DATABASE_URL validator: `postgresql://` → `mysql://`

14. **`tests/setup.ts`**
    - Test DATABASE_URL: `postgresql://test:test@localhost:5432/streamverse_test?schema=public` → `mysql://test:test@localhost:3306/streamverse_test`

15. **`tests/unit/env.test.ts`**
    - Base DATABASE_URL: `postgresql://` → `mysql://`
    - Rejection test: `mysql://` → `postgresql://`, assertion checks for `/mysql/`

---

## Completed — 2026-10-15

All steps executed successfully:

- ✓ `001_mysql_initial_setup.sql` run as MySQL root
- ✓ `.env` DATABASE_URL updated to `mysql://streamverse:***@localhost:3306/streamverse_dev`
- ✓ `npx prisma migrate dev --name mysql_baseline` — 52 tables created
- ✓ Verification scripts 002–006 all PASS
- ✓ `npx prisma db seed` — admin account, 11 languages, 17 genres, 13 warning types, 3 legal docs, 7 settings
- ✓ Backend tests: 510/510 passed (66 files)
- ✓ Backend TypeScript: 0 errors
- ✓ Backend build: PASS
- ✓ Frontend TypeScript: 0 errors
- ✓ Frontend build: PASS (3.48s)
- ✓ Prisma validate: PASS
- ✓ Prisma generate: PASS

---

## 2026-10-19 — Media/R2/performance audit: added missing indexes

| Script | Purpose | Environment | Result | Notes |
|---|---|---|---|---|
| `local/007_performance_indexes.sql` | Add `Content.createdAt`, `User.createdAt`, `Payment.paidAt` indexes | Local (`streamverse_dev`) | PASS | `prisma migrate dev` failed with `ALTER command denied ... for table 'authsession'` — the app DB user lacks CREATE on Prisma's shadow database. Applied instead via `prisma db push --skip-generate`, then created `prisma/migrations/20261019235944_add_performance_indexes/migration.sql` by hand and reconciled history with `prisma migrate resolve --applied`. Production should run the real migration via `prisma migrate deploy`, which does not need a shadow database. |

Root cause found in the same audit: Admin Dashboard showed a movie/eBook/audiobook thumbnail that the Admin Movies/eBooks/Audiobooks tables showed empty for. The admin list endpoints (`content.repository.ts` `adminList`, `content.mapper.ts` `mapContentListRow`) never joined or returned any poster/cover asset at all — fixed by adding a batched `signCoversByContentId()` helper (`catalog.service.ts`) reused by all three admin list controllers. Separately, `admin.dashboard.tsx` had a no-op `DEMO_MODE ? demoMovies : demoMovies` ternary that always rendered local demo artwork regardless of mode, masking the real bug — fixed to use the real API-backed list when not in demo mode. Also fixed: customer eBook/Audiobook catalog cards never signed/returned a cover URL at all (`catalog.repository.ts` `listEbooks`/`listAudiobooks` didn't join the cover asset relation).

---

## 2026-10-20 — Homepage dynamic-section architecture: backend now resolves every section, content-type scoped

| Script | Purpose | Environment | Result | Notes |
|---|---|---|---|---|
| `local/008_homepage_section_content_type.sql` | Backfill `HomepageSection.contentType` for the 9 baseline seed rows | Local (`streamverse_dev`) | PASS | Column added via `prisma db push` (same shadow-DB privilege gap as the performance-index migration), matching migration hand-written at `prisma/migrations/20261020010000_homepage_section_content_type/` and reconciled with `prisma migrate resolve --applied`. Backfill itself run via `scripts/backfill-homepage-content-type.ts` (no `mysql` CLI available in this environment) — 3 rows set to MOVIE, 2 to EBOOK, 2 to AUDIOBOOK. |

**Resolved contradiction**: `homepage.service.ts`'s `getCustomerHomepage()` previously documented "dynamic sections return empty items — the frontend derives them from the catalog API independently" while a test expected FEATURED to carry resolved items — an unresolved, undefined contract. Canonical decision: **the backend resolves every section's items** (MANUAL via admin-curated `displayOrder`, dynamic via the same `customerVisibleWhere` catalog query `/movies`/`/ebooks`/`/audiobooks` use), returned as one card-safe shape (`contentId`, `contentType`, `position`, top-level `slug`/`title`/`image`, plus the existing per-type `movie`/`ebook`/`audiobook` sub-object for backward compatibility) with images batch-signed once across the whole response (never per section, never per card). Personalized sections (Continue Watching/Reading/Listening) are **not** part of this model at all — `HomepageSection.type` is only `MANUAL` or one of 5 dynamic flags; continue-watching stays its own authenticated, per-user endpoint, correctly excluded from this public payload.

**Bug this surfaced immediately on first live run against the real DB**: `catalogRepository.listDynamic()` had no content-type filter, so "Featured eBooks" was resolving a *movie* that happened to share the global `featured` flag. Fixed by adding `HomepageSection.contentType` (nullable `MOVIE`/`EBOOK`/`AUDIOBOOK`, required for dynamic sections, forbidden for MANUAL — enforced by a Zod refine in `homepage.validator.ts`) and threading it through `listDynamic(flag, limit, contentType)`.

**Frontend-contract decision**: the frontend's homepage route was NOT changed to drop its separate `/movies`+`/ebooks`+`/audiobooks` catalog fetches in this pass — that is a materially larger, riskier change (hero slides, continue-watching, banner resolution, and dynamic-section sorting all currently read from that fully-fetched catalog) than fits this session's verification budget, and the original brief for this project explicitly says not to rebuild the architecture. The backend contract is now complete and correct for any consumer (tests, Admin preview, or a future frontend consolidation) — flagged as a follow-up, not silently skipped.

---

## 2026-10-20 — Admin Media Library (`/admin/media`)

| Script | Purpose | Environment | Result | Notes |
|---|---|---|---|---|
| `local/009_admin_media_library.sql` (identical to `prisma/migrations/20261021090000_admin_media_library/migration.sql`) | (1) Make the 16 artwork slot columns (poster/backdrop/thumbnail, eBook covers, audiobook cover/thumbnail, narrator/cast photos, banners, collection image) shareable: add a plain index to each, then drop its old UNIQUE index; (2) add `MediaAsset.displayTitle/altText/caption/notes/folder` and the `LIBRARY_IMAGE` enum value; (3) add `MediaAsset(createdAt)` and `MediaAsset(folder)` indexes | Local (`streamverse_dev`) | PASS | Applied with `prisma db execute --file ... --schema prisma/schema.prisma`, then `prisma migrate resolve --applied 20261021090000_admin_media_library` (`prisma migrate dev` cannot run here: the app DB user has no right to create Prisma's shadow database; production uses `prisma migrate deploy`, which needs none). Each new plain index is created BEFORE its UNIQUE index is dropped so the foreign key always has an index to use. Files that belong to exactly one title (master video, EPUB/PDF, audio, captions, chapters) stay UNIQUE. No `mysql` CLI in this environment, hence `db execute`. |

**Data safety** (`scripts/media-counts.ts`, read-only, run before and after): 28 rows / 28 with a storage key / 3,369,759 bytes / identical per-type and per-status counts before and after the migration. Nothing was deleted or rewritten by it.

**Rollback**: drop the 16 plain `*_idx` indexes and recreate the 16 `*_key` UNIQUE indexes (only possible while no artwork is shared), drop the five new `MediaAsset` columns and the two new indexes. The `LIBRARY_IMAGE` enum value can stay (an unused enum value is harmless).

**Why not a new table**: the existing `MediaAsset` row already is the single source of truth (one row per stored R2 object, with the slot columns on Movie/Ebook/Audiobook/Banner/Collection as the "attachments"). "Used by" is computed from those slot columns by `src/services/media/assetSlots.ts`, one query per owning model per request; nothing is duplicated.

---

## 2026-10-21 — Hero banners per sub-page, banner subscription link, homepage Banner/Collection sections, default plans

| Script | Purpose | Environment | Result | Notes |
|---|---|---|---|---|
| `local/010_banner_placement.sql` | `Banner.placement` ENUM('MOVIES','EBOOKS','AUDIOBOOKS') NULL: which sub-page a HERO banner leads (the homepage hero is managed in Homepage settings, not by banners) | Local (`streamverse_dev`) | PASS | `prisma db execute` + `migrate resolve --applied 20261021120000_banner_placement` |
| `local/011_banner_subscription_link.sql` | `Banner.linkToSubscription` BOOLEAN NOT NULL DEFAULT false: a banner button can open the Subscription page | Local | PASS | `20261021120100_banner_subscription_link` |
| `local/012_homepage_banner_collection_sections.sql` | `HomepageSection.bannerId` / `collectionId` (nullable FKs, ON DELETE SET NULL) + indexes on `displayOrder`, `bannerId`, `collectionId`: a homepage section can be a Banner picked from the Banner library or a Collection; its position is the section's `displayOrder` | Local | PASS | `20261021200000_homepage_banner_collection_sections`; `prisma migrate status`: schema up to date |

**Data changes without a SQL file** (done through the application's own APIs/scripts, repeatable):
- `scripts/seed-plans.ts` — the four default plans (Basic $6.99, Standard $12.99, Premium $19.99, Premium Annual $199) with their entitlements. Idempotent (matched by slug; Stripe objects by `lookup_key`). Run with `--offline` because the Stripe key in `.env` is a placeholder: those rows carry `price_offline_*` ids and checkout refuses them with a clear message until the script is re-run with a real Stripe test key.
- `scripts/attach-sample-media.ts` — gives the 10 seeded sample movies, 10 sample eBooks and 8 sample audiobooks a real file each (the supplied MP4 / EPUB / MP3) through the normal upload pipeline. One MediaAsset per title because master video / EPUB / audio columns are UNIQUE by design.

---

## 2026-10-21 / 22 — Large uploads, banners placing themselves on the homepage, real Stripe test prices

| Script | Purpose | Environment | Result | Notes |
|---|---|---|---|---|
| `local/013_multipart_upload_id_text.sql` | `MultipartUpload.providerUploadId` VARCHAR(191) → TEXT: R2 multipart upload ids are longer than 191 characters, so every upload over 100 MB failed with a 500 | Local (`streamverse_dev`) | PASS | `prisma db execute` + `migrate resolve --applied 20261021210000_multipart_upload_id_text`; verified with a 110 MB PDF (4 parts) → READY |
| `local/014_banner_homepage_placement.sql` | `Banner.showOnHomepage` BOOLEAN NOT NULL DEFAULT false + `Banner.homepageAfter` VARCHAR(100) NULL: a banner decides itself whether and where it appears on the homepage (`top`, after a section key, or NULL = bottom). Never for HERO banners (validator). A Banner section that already places the same banner wins (no duplicates) | Local | PASS | `20261022090000_banner_homepage_placement`; existing banners default to not shown, so nothing changed on the live homepage until an admin opts in |

**Data changes without a SQL file**:
- `scripts/seed-plans.ts` re-run WITH the Stripe TEST key: the four plans now carry real Stripe test Products/Prices (`price_1UT9V…`), replacing the `price_offline_*` placeholders. Idempotent (Stripe `lookup_key`).

---

## 2026-10-23 — Files shared between titles by link, flipbook option for eBooks

| Script | Purpose | Environment | Result | Notes |
|---|---|---|---|---|
| `local/015_shared_files_and_flipbook.sql` | Drops the UNIQUE indexes on the file columns of Movie / Ebook / Audiobook (replaced by plain indexes) so one uploaded file can be linked from many titles instead of copied (storage saving; delete protection and the cleanup job already look at "used by"); adds `Ebook.flipbookEnabled` BOOLEAN NOT NULL DEFAULT false: the eBook page shows an extra Flipbook (page-turn) button built from the PDF | Local (`streamverse_dev`) | PASS | hand-written (prisma migrate diff adds unrelated FK re-adds on Windows/MySQL); `prisma db execute` + `migrate resolve --applied 20261023120000_shared_files_and_flipbook`. Verified end to end with `e2e/live/flipbook.r2.live.spec.ts` |
