# StreamVerse — SQL Archive

## Why this directory exists

Prisma migrations are the primary schema deployment mechanism.
This directory archives **manual SQL** run outside of Prisma for:
- Pre-migration verification
- Post-migration verification
- Schema and data integrity checks
- Controlled fixes that cannot go through Prisma
- Future operational reference

---

## Directory Structure

```
database/sql/
  local/          One-time setup scripts for local development
  verification/   Read-only checks — safe to run at any time
  production/     Scripts reviewed for staging/production use
```

---

## Execution Order

Scripts are numbered in the order they should be consulted:

| File | Purpose | Executed locally |
|------|---------|-----------------|
| `local/001_mysql_initial_setup.sql` | Create database/user for local dev | Yes (requires root) |
| `verification/002_schema_precheck.sql` | Confirm target DB/charset exists | Yes |
| `verification/003_schema_verification.sql` | Verify all tables exist | Yes |
| `verification/004_index_verification.sql` | Verify critical indexes | Yes |
| `verification/005_data_integrity_checks.sql` | Foreign keys, unique constraints | Yes |
| `verification/006_post_migration_verification.sql` | Charset, collation, SQL mode | Yes |
| `production/007_production_checklist.sql` | Pre-go-live production verification | Pending |

---

## PRODUCTION EXECUTION RULES

1. **Take a backup first** — always, before any schema change
2. **Never run `prisma migrate dev` or `prisma migrate reset` in production**
3. Use `npx prisma migrate deploy` for production migrations
4. Review SQL against the current production migration state before running
5. Manual SQL in `production/` is for verification and controlled fixes only
6. Every manual SQL execution must be logged in `EXECUTION_LOG.md`
7. Development-only scripts (`local/`) must NEVER be run in production

---

## Collation

All tables use `utf8mb4_unicode_ci`.
This means `email`, `slug`, and other string comparisons are case-insensitive by default.
Application code normalizes emails to lowercase before persistence as an additional safeguard.

---

## Minimum MySQL version

MySQL 8.0+ is required. The schema uses:
- `utf8mb4` character set
- `utf8mb4_unicode_ci` collation
- `InnoDB` storage engine (default in MySQL 8)
- JSON column type (MySQL 5.7.8+)

---

## Connection pooling (production notes)

Prisma's default connection pool: `url?connection_limit=N`
- For a 2-CPU VM: `connection_limit=10`
- For serverless/edge: use PlanetScale or Prisma Accelerate
- MySQL's `max_connections` default is 151; leave headroom for root/monitoring

See [Prisma connection management docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections).
