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
| `local/001_mysql_initial_setup.sql` | Create streamverse_dev DB and user | Local dev | PENDING | PENDING | Blocked: MySQL root password not available to automated process. Must be run manually by developer. |
| `verification/002_schema_precheck.sql` | Verify DB charset/collation/version | Local dev | PENDING | PENDING | Run after 001 |
| `verification/003_schema_verification.sql` | Verify all tables exist | Local dev | PENDING | PENDING | Run after `prisma migrate dev` |
| `verification/004_index_verification.sql` | Verify indexes | Local dev | PENDING | PENDING | Run after 003 |
| `verification/005_data_integrity_checks.sql` | FK, dead fields, Plan entitlements | Local dev | PENDING | PENDING | Run after 003 |
| `verification/006_post_migration_verification.sql` | Engine, charset, SQL mode, connection | Local dev | PENDING | PENDING | Run after 003 |

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

---

## Pending (requires MySQL credentials)

- Run `001_mysql_initial_setup.sql` as MySQL root
- Update `.env` DATABASE_URL with real credentials
- Run `npx prisma migrate dev --name mysql_baseline`
- Run verification scripts 002–006
- Run `npx prisma db seed`
