# StreamVerse Environment Variables

## Backend (streamverse-api)

### Required in Production

| Variable | Example | Notes |
|---|---|---|
| DATABASE_URL | postgresql://user:pass@host:5432/streamverse?sslmode=require | PostgreSQL with TLS |
| REDIS_URL | redis://:password@host:6379 | Or rediss:// for TLS |
| JWT_SECRET | (64+ hex chars) | Generated with crypto.randomBytes(64).toString('hex') |
| JWT_REFRESH_SECRET | (64+ hex chars, different from above) | Separate from access token secret |
| STRIPE_SECRET_KEY | sk_live_… | Never expose to browser |
| STRIPE_WEBHOOK_SECRET | whsec_… | From Stripe webhook config |
| AWS_ACCESS_KEY_ID | (R2/S3 access key) | Variable name used in .env.example |
| AWS_SECRET_ACCESS_KEY | (R2/S3 secret) | Never expose to browser |
| AWS_BUCKET | streamverse-prod | Separate from dev/staging bucket |
| AWS_ENDPOINT | https://…r2.cloudflarestorage.com | Set for R2 / non-AWS providers |

### Recommended in Production

| Variable | Example | Notes |
|---|---|---|
| SENTRY_DSN | https://…@sentry.io/… | Error tracking |
| EMAIL_FROM | noreply@streamverse.com | Must match verified domain |
| RESEND_API_KEY | re_… | Resend API key |
| APP_PUBLIC_URL | https://streamverse.com | Used in reset-password email links |
| ALLOWED_ORIGINS | https://streamverse.com,https://www.streamverse.com | CORS — no trailing slash, no wildcards |
| TRUST_PROXY | 1 | Set to 1 behind Cloudflare/load balancer |
| PLAYBACK_SESSION_TIMEOUT_SECONDS | 120 | Session stale timeout |
| NODE_ENV | production | |
| LOG_LEVEL | info | fatal \| error \| warn \| info \| debug |

### Optional

| Variable | Example | Notes |
|---|---|---|
| SENTRY_ENVIRONMENT | production | |
| SENTRY_RELEASE | (git SHA) | |
| ERROR_RATE_WARNING_PERCENT | 2 | 5xx warning threshold |
| ERROR_RATE_CRITICAL_PERCENT | 5 | 5xx critical threshold |
| SLOW_REQUEST_THRESHOLD_MS | 3000 | Requests slower than this logged as WARN |
| WORKER_HEARTBEAT_TIMEOUT_SECONDS | 300 | Seconds before worker considered dead |
| QUEUE_BACKLOG_WARNING | 50 | Queue depth warning threshold |
| QUEUE_BACKLOG_CRITICAL | 200 | Queue depth critical threshold |
| ENTITLEMENT_CACHE_TTL_SECONDS | 60 | 0 = disabled |
| ANALYTICS_CACHE_TTL_SECONDS | 30 | 0 = disabled |
| SUBSCRIPTION_PAST_DUE_GRACE_DAYS | 0 | Days past-due before access cut off |
| ACCESS_TOKEN_TTL | 15m | JWT access token lifetime |
| REFRESH_TOKEN_TTL_DAYS | 30 | Refresh token / session lifetime |
| PORT | 4000 | |
| API_DOCS_ENABLED | false | Defaults to false in production |
| FFMPEG_PATH | /usr/bin/ffmpeg | Only if ffmpeg is not on PATH |
| FFPROBE_PATH | /usr/bin/ffprobe | Only if ffprobe is not on PATH |
| MEDIA_BASE_URL | https://cdn.streamverse.com | Public CDN base URL; falls back to signed URLs |

## Frontend (streamverse)

### Required in Production

| Variable | Example | Notes |
|---|---|---|
| VITE_DEMO_MODE | false | Must be false in production |
| VITE_API_BASE_URL | https://api.streamverse.com/api/v1 | No trailing slash |
| VITE_STRIPE_PUBLISHABLE_KEY | pk_live_… | Publishable only — never secret key |

### Optional

| Variable | Example | Notes |
|---|---|---|
| VITE_SENTRY_DSN | https://…@sentry.io/… | Frontend error tracking |
| VITE_APP_VERSION | 1.0.0 | Shown in Sentry releases |

## Secret Rotation

### JWT_SECRET / JWT_REFRESH_SECRET

1. Generate new secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
2. Update in secret manager
3. Redeploy backend — existing sessions will be invalidated (users must re-login)

### STRIPE_WEBHOOK_SECRET

1. Roll the secret in Stripe dashboard → Webhooks → your endpoint → Roll secret
2. Update STRIPE_WEBHOOK_SECRET in secret manager
3. Redeploy backend

### RESEND_API_KEY

1. Create new API key in Resend dashboard
2. Update RESEND_API_KEY in secret manager
3. Redeploy backend
4. Revoke old key in Resend dashboard

### Storage Keys (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)

1. Create new access key in R2/S3
2. Update AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in secret manager
3. Redeploy backend and workers
4. Delete old key

## Never Do

- Commit any of the above to source control
- Use staging JWT secrets in production
- Put sk_live_ in VITE_ env vars (they end up in the browser bundle)
- Reuse the same secret across environments
- Set STORAGE_PROVIDER=local in production (data is lost on redeploy)
