# Production MySQL (Aiven) — backup check and restore rehearsal

Never restore over the live database. Every step below restores into a NEW, separate service and is deleted afterwards.

## 1. Confirm backups exist (Aiven console → the MySQL service)

- **Backups** tab: automated backups are listed, with the time of the latest one (it should be within the last 24 h).
- Note the plan's **backup frequency** and **retention** shown there (they depend on the plan; the free plan has fewer or none).
- **Point-in-time recovery**: available on the plan or not (shown as "Fork from a point in time" when it is).
- If no backup is listed: the plan has none. Upgrade the plan, or run your own dump (step 4) on a schedule before launch.

## 2. Rehearse a restore (staging copy)

1. Aiven console → the MySQL service → **Fork service** (or "New service from backup"): choose the latest backup or a point in time,
   a NEW service name (e.g. `streamverse-restore-test`) and the smallest plan. This never touches the live service.
2. When it is running, take its connection string (it has its own host and password; do not paste it anywhere shared).
3. From `streamverse-api`, point ONE command at it (do not edit `.env`):
   ```
   DATABASE_URL="<restore service url>" npx prisma migrate status
   DATABASE_URL="<restore service url>" npx prisma db execute --file database/sql/verification/003_schema_verification.sql --schema prisma/schema.prisma
   ```
   `migrate status` must say the schema is up to date (same migrations as production).
4. Spot-check critical tables (counts should match production at backup time): `User`, `Subscription`, `Payment`, `Plan`,
   `Content`, `Movie`, `Ebook`, `Audiobook`, `MediaAsset`, `MovieProgress`, `UserHistory`, `_prisma_migrations`.
5. Optional: start a local API against it (`DATABASE_URL=… PORT=4300 node dist/server.js`), sign in as a known account, open a title.
6. Record the result (date, backup used, migration status, counts) in `../EXECUTION_LOG.md`.
7. Delete the restore service in the Aiven console once the rehearsal is signed off.

## 3. A real restore (incident)

Same as step 2 into a new service, verify it, then switch `DATABASE_URL` on Render to the new service and redeploy. The old
service is kept (not deleted) until the new one is confirmed healthy. R2 objects are not part of a database backup: media
uploaded after the backup time exists in R2 but is unknown to the restored database (the hourly reconciliation report lists it).

## 4. Own logical dump (if the plan has no automated backups)

```
mysqldump --single-transaction --routines --set-gtid-purged=OFF -h <host> -P <port> -u <user> -p --ssl-ca=ca.pem <db> | gzip > streamverse-YYYYMMDD.sql.gz
```
Store it outside Aiven (encrypted), and rehearse restoring it into a separate database the same way.
