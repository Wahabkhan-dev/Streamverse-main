# StreamVerse Monitoring & Alerting

## Provider

Sentry (error tracking, performance). Disabled unless `SENTRY_DSN` is set. The app starts and runs normally when no DSN is configured.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SENTRY_DSN` | _(empty)_ | Sentry project DSN. Leave empty to disable all Sentry tracking. |
| `SENTRY_ENVIRONMENT` | `NODE_ENV` | production / staging / development |
| `SENTRY_RELEASE` | `unknown` | Git commit SHA or version tag sent with every Sentry event |
| `VITE_SENTRY_DSN` | _(empty)_ | Frontend DSN (separate Sentry project recommended) |
| `ERROR_RATE_WARNING_PERCENT` | `2` | 5xx warning threshold — configure alert in Sentry dashboard |
| `ERROR_RATE_CRITICAL_PERCENT` | `5` | 5xx critical threshold — configure alert in Sentry dashboard |
| `SLOW_REQUEST_THRESHOLD_MS` | `3000` | Requests slower than this are logged as WARN |
| `WORKER_HEARTBEAT_TIMEOUT_SECONDS` | `300` | Seconds without a heartbeat before a worker is considered dead |
| `QUEUE_BACKLOG_WARNING` | `50` | Queue depth that triggers a warning alert |
| `QUEUE_BACKLOG_CRITICAL` | `200` | Queue depth that triggers a critical alert |

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /health` | None | Liveness probe — uptime + timestamp |
| `GET /ready` | None | Readiness probe — DB, Redis, queue status |
| `GET /metrics` | Admin JWT | In-process counters: request counts, error rates, P50/P95/P99 latency |

## What Is Tracked

- All unhandled backend exceptions (5xx) → Sentry
- 5xx / 4xx error rate (in-process counters, visible at `GET /metrics`)
- Request latency P50 / P95 / P99
- Slow requests >3 s logged as WARN with requestId
- DB and Redis health in `/ready`
- Queue backlog counts (waiting / active / failed) in `/ready` when `QUEUE_DRIVER=bullmq`

## What Is NOT Sent to Sentry

The `beforeSend` hook scrubs the following fields before any event leaves the process:

- Passwords, password hashes, new/old passwords
- Tokens: `accessToken`, `refreshToken`, `resetToken`
- Secrets: `clientSecret`, `apiKey`, `stripe_secret`
- Connection strings: `database_url`, `redis_url`
- HTTP headers: `authorization`, `cookie`, `set-cookie`, `x-stripe-signature`
- Card data (handled by Stripe directly — never reaches this API)

## Local Development

Set `SENTRY_DSN=` (empty) to disable. On startup, the API logs:

```
[sentry] SENTRY_DSN not set — error tracking disabled
```

No other changes needed.

## Staging Setup

1. Create a Sentry project for the staging environment.
2. Copy the DSN into `SENTRY_DSN` in your staging environment variables.
3. Set `SENTRY_ENVIRONMENT=staging` and `SENTRY_RELEASE=<git-sha>`.
4. Deploy and hit a 500 endpoint to verify events appear in the Sentry dashboard.

## Alert Channels

Configure in the Sentry dashboard under **Alerts → Alert Rules**: email, Slack, PagerDuty. No code changes are needed — routing is configured entirely in Sentry UI.

---

## Email Monitoring

Email delivery failures are logged with:
- `[email:resend]` or `[email:console]` prefix
- `to=` (recipient address)
- `subject=` (subject, for billing notifications)
- No token values logged in full

### Alert on email failures

Configure Sentry to alert when:
- password-reset emails fail repeatedly
- billing notification failures spike

Welcome email failures are non-fatal (logged as warn only).

---

## Incident Runbook

### API Outage (5xx spike)

1. Check `GET /health` — is the process alive?
2. Check `GET /ready` — which dependency returned `"unavailable"`?
3. Open Sentry → Issues — look for error clusters with matching `requestId` tags.
4. Check DB connectivity (see DB Outage below).
5. Check Redis connectivity (see Redis Outage below).
6. Roll back the last deployment if the spike correlates with it.

### DB Outage

1. `GET /ready` → `checks.database` will show `"unavailable"`.
2. Check PostgreSQL service health on the host / managed service dashboard.
3. All DB-dependent routes return `503` automatically; health/ready endpoints still respond.

### Redis Outage

1. `GET /ready` → `checks.redis` will show `"unavailable"` (or `"disabled"` if Redis was never configured).
2. Rate limiting degrades gracefully (express-rate-limit falls back to in-memory).
3. BullMQ workers will pause — no new media processing jobs will run.
4. Entitlement cache is disabled; access checks hit the DB directly.

### Stripe Webhook Failures

1. Check the `StripeEvent` table for rows with `status = FAILED`.
2. Open Sentry → filter by `route=/api/v1/webhooks` to find handler errors.
3. Replay the event from the Stripe dashboard → Webhooks → select the endpoint → Resend.

### Worker Stopped

1. Check the worker heartbeat key in Redis: `GET worker:heartbeat:<workerName>`.
2. Check queue backlog at `GET /ready` → `queues` (requires `QUEUE_DRIVER=bullmq`).
3. Check worker process logs for a fatal startup error (ffmpeg missing, Redis unreachable).
4. Restart the worker process: `npm run worker:start` (production: restart the systemd/PM2 unit).

---

## Dashboard

Use the **Sentry Performance** dashboard for latency trends, error rate visualization, and release comparisons.

Use `GET /metrics` (admin JWT required) for a quick operational snapshot:

```json
{
  "requests": 12340,
  "errors5xx": 3,
  "errors4xx": 201,
  "latency": { "p50": 42, "p95": 210, "p99": 890 }
}
```

> **Note:** counters reset on process restart. For persistent metrics, wire the `/metrics` output into a time-series store (Prometheus push-gateway, Datadog StatsD, etc.).
