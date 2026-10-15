# StreamVerse Production Deployment Guide

## Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Cloudflare R2 (or S3-compatible storage)
- Resend account (or other email provider)
- Stripe account

## Required Secrets (never commit these)

| Variable | Description |
|---|---|
| DATABASE_URL | PostgreSQL connection string with TLS |
| REDIS_URL | Redis connection string |
| JWT_SECRET | High-entropy access token signing secret (≥64 chars) |
| JWT_REFRESH_SECRET | Separate high-entropy refresh token secret (≥64 chars) |
| STRIPE_SECRET_KEY | Live secret key (sk_live_…) |
| STRIPE_WEBHOOK_SECRET | Live webhook signing secret (whsec_…) |
| VITE_STRIPE_PUBLISHABLE_KEY | Live publishable key (pk_live_…) — frontend only |
| AWS_ACCESS_KEY_ID | R2/S3 access key |
| AWS_SECRET_ACCESS_KEY | R2/S3 secret key |
| AWS_BUCKET | Production bucket name |
| AWS_ENDPOINT | R2/S3 endpoint URL |
| RESEND_API_KEY | Resend transactional email API key |
| SENTRY_DSN | Backend Sentry DSN |
| VITE_SENTRY_DSN | Frontend Sentry DSN |

## Generating JWT Secrets

Run once per environment (never reuse staging secrets in production):

```
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run twice — one for JWT_SECRET, one for JWT_REFRESH_SECRET.

## Safe Deployment Order

1. Provision PostgreSQL (separate database from staging)
2. Provision Redis
3. Configure Cloudflare R2 / S3 storage bucket
4. Store all secrets in hosting provider's secret manager
5. Deploy backend API — DO NOT start workers yet
6. Run Prisma migrations: `npx prisma migrate deploy`
7. Verify migration: `npx prisma migrate status`
8. Start backend API
9. Verify: GET /health → 200, GET /ready → all green
10. Deploy and start workers (video, audio, cleanup)
11. Configure live Stripe webhook pointing to `https://<api-domain>/api/v1/stripe/webhook`
12. Configure email provider (verify domain SPF/DKIM first)
13. Build and deploy frontend with production env
14. Configure DNS / Cloudflare
15. Run smoke tests (see below)
16. Enable monitoring alerts
17. Open production traffic

## Never Do In Production

- `npx prisma migrate reset` — destroys all data
- `npx prisma migrate dev` — use `migrate deploy` instead
- Reuse staging JWT secrets
- Deploy frontend before backend API is ready
- Point Stripe live webhook to staging URL

## Backend Build & Start

```bash
npm ci
npx prisma generate
npm run build
NODE_ENV=production node dist/server.js
```

## Worker Start (separate process)

```bash
NODE_ENV=production node dist/workers/index.js
```

## Frontend Build

```bash
cd streamverse
npm ci
VITE_DEMO_MODE=false VITE_API_BASE_URL=https://api.streamverse.com npm run build
# Output in dist/
```

## Health Verification

After backend deploys:
- GET https://api.streamverse.com/health → `{ "status": "ok" }`
- GET https://api.streamverse.com/ready → `{ "status": "ready", "dependencies": { "database": "ok", "redis": "ok" } }`

## Smoke Tests

Test these flows after deployment:
1. GET / (frontend loads)
2. GET /api/v1/plans (public plans load)
3. POST /api/v1/auth/register (account creation)
4. POST /api/v1/auth/login (login returns tokens)
5. GET /api/v1/auth/me with Bearer token (profile returns)
6. POST /api/v1/auth/forgot-password + check email delivery
7. GET /api/v1/movies (catalog loads)
8. Admin login → Admin dashboard loads

## Rollback

See docs/rollback.md
