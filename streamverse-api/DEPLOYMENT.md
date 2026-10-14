# StreamVerse API — Deployment Guide

## Requirements

| Component | Minimum version | Notes |
|-----------|----------------|-------|
| Node.js | 20.x LTS | Use `.nvmrc` / `engines` field |
| PostgreSQL | 16 | Tested on 16-alpine |
| Redis | 7 | Required only when `QUEUE_DRIVER=bullmq` |
| FFmpeg | 4.4+ | Required for video transcoding (HLS) |
| S3-compatible storage | — | AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces |

---

## Environment Variables

See `.env.example` for the full, annotated list. Critical values in production:

| Variable | Production requirement |
|----------|----------------------|
| `NODE_ENV` | Must be `production` |
| `DATABASE_URL` | Must be set, must be `postgresql://` |
| `JWT_SECRET` | 32+ chars, no placeholder words |
| `JWT_REFRESH_SECRET` | 32+ chars, different from `JWT_SECRET` |
| `STRIPE_SECRET_KEY` | Must start with `sk_live_` |
| `FRONTEND_URL` | Must use `https://` |
| `ALLOWED_ORIGINS` | No wildcards; all must use `https://` |
| `STORAGE_PROVIDER` | Use `s3`/`r2`/`b2`/`spaces` (not `local`) |

The server **refuses to start** if any of these constraints are violated — no silent misconfiguration.

---

## Database Migration Steps

```bash
# 1. Ensure DATABASE_URL points to your production database.
# 2. Deploy migrations (no interactive prompts; safe for CI/CD pipelines):
npx prisma migrate deploy

# 3. Verify the schema is current:
npx prisma validate
```

Never run `prisma migrate dev` in production — it can drop data.

---

## Admin Bootstrap

The API never creates admin accounts through `POST /auth/register`. Run the bootstrap script **once**, explicitly:

```bash
ADMIN_EMAIL=you@yourdomain.com \
ADMIN_PASSWORD=<strong-16+-char-password> \
ADMIN_NAME="Your Name" \
npx tsx scripts/createAdmin.ts
```

Or set the three variables in your `.env` first, then run `npx tsx scripts/createAdmin.ts`.

The script is idempotent: if the email already exists it prints a message and exits cleanly.

---

## Stripe Webhook Setup

1. In the [Stripe Dashboard](https://dashboard.stripe.com/webhooks), create an endpoint pointing to `https://api.yourdomain.com/api/v1/webhooks/stripe`.
2. Select the events: `customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`.
3. Copy the signing secret and set `STRIPE_WEBHOOK_SECRET=whsec_...` in your environment.
4. The endpoint validates every request with the HMAC signature — no shared secret is ever sent in a header.

---

## Deployment Order

1. **Provision dependencies**: PostgreSQL 16, Redis 7, S3-compatible bucket, FFmpeg on worker nodes.
2. **Configure secrets**: set all required env vars in your platform's secret store (never in source code).
3. **Run migrations**: `npx prisma migrate deploy`.
4. **Bootstrap admin**: `npx tsx scripts/createAdmin.ts` (once).
5. **Deploy API**: start `node dist/server.js` (or `npm start`). The process exits immediately if the env is misconfigured.
6. **Deploy workers** (if using BullMQ): `node dist/workers/start.js`.
7. **Verify readiness**: `GET /ready` must return 200 before routing traffic.
8. **Configure Stripe webhook**: point the dashboard endpoint to `/api/v1/webhooks/stripe`, copy the signing secret, redeploy if the secret changed.
9. **Seed reference data**: `npx tsx prisma/seed.ts` (idempotent — safe to re-run).
10. **Smoke test**: see checklist below.

---

## Health and Readiness Endpoints

| Endpoint | Purpose | DB check |
|----------|---------|----------|
| `GET /health` | Liveness — is the process alive? | No |
| `GET /ready` | Readiness — can it serve traffic? | Yes (`SELECT 1`) |

Configure your load balancer / orchestrator to:
- Use `/health` as the liveness probe (fast, always available).
- Use `/ready` as the readiness probe (gates traffic).

---

## Production Smoke Test Checklist

- [ ] `GET /health` returns `200 { status: "ok" }`
- [ ] `GET /ready` returns `200 { ready: true, checks: { database: "ok" } }`
- [ ] `POST /api/v1/auth/register` creates a user and returns an access token
- [ ] `POST /api/v1/auth/login` returns a token for the admin account
- [ ] `GET /api/v1/admin/content` with the admin Bearer token returns `200`
- [ ] `GET /api/v1/billing/plans` returns the active Stripe plans
- [ ] A Stripe test-webhook event (sent from dashboard) is processed without error
- [ ] Security headers present: `x-content-type-options: nosniff`, `strict-transport-security`, `content-security-policy`
- [ ] `x-powered-by` header is absent
- [ ] A 404 request returns JSON, not HTML

---

## Rollback Plan

1. **Database**: Prisma does not auto-generate down migrations. Before a deploy, capture the current migration version (`npx prisma migrate status`). To roll back schema changes, restore from a database snapshot or write a manual reverse migration.
2. **API**: redeploy the previous container image / git tag. The API is stateless; rollback requires no data migration unless a schema change was deployed.
3. **Stripe**: Stripe data is immutable history. No rollback is needed for webhook events already processed; idempotency keys prevent re-application.

---

## Backup Strategy

| Data | Recommended strategy | Notes |
|------|---------------------|-------|
| PostgreSQL | Continuous WAL archiving + daily snapshots | Platform-managed (TBD — configure per hosting provider) |
| Media files (S3) | S3 versioning + cross-region replication | TBD — configure per bucket |
| Redis | Redis persistence (AOF) | Cache only; data loss is acceptable if Redis restarts clean |

---

## RPO / RTO Targets

| Metric | Target | Status |
|--------|--------|--------|
| Recovery Point Objective (RPO) | TBD | Configure WAL archiving |
| Recovery Time Objective (RTO) | TBD | Depends on restore procedure |

---

## Data Retention Policy

| Data type | Retention | Reason |
|-----------|-----------|--------|
| User accounts | Until deletion request + 30-day hold | GDPR right to erasure |
| Payments and refunds | 7 years | Financial compliance (TBD — verify per jurisdiction) |
| Audit logs (`AuditLog`) | 1 year minimum | Security review (TBD per policy) |
| Analytics events (`AnalyticsEvent`) | 90 days rolling | Configurable via cron/cleanup job |
| Password reset tokens | Delete after use or expiry | `PasswordResetToken.usedAt` / `expiresAt` |
| Auth sessions (refresh tokens) | Delete after expiry | `AuthSession.expiresAt` |
| Revoked sessions | Retained (not deleted) | Detects reused/stolen refresh tokens |

Cleanup jobs for expired tokens and old analytics events are **not yet automated** — mark as TBD and schedule before launch.

---

## Security Notes

- **CSRF**: this API uses `Authorization: Bearer <token>` exclusively for protected endpoints. Browser cookies are used only for the httpOnly refresh token, which is not readable by JavaScript and is SameSite-protected. CSRF attacks do not apply to the Bearer token flow; the refresh-token cookie is validated by its own rotation mechanism, not by a CSRF token.
- **Rate limiting**: limits are in-process (single instance). For multi-instance deployments, configure `express-rate-limit` with a Redis store (e.g. `rate-limit-redis`).
- **Secrets rotation**: rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` by deploying a new value and restarting; existing sessions will require re-login. No automated rotation tooling is currently configured.
