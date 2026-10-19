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
