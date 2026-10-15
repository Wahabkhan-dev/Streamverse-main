# StreamVerse Rollback Guide

## Frontend Rollback

Redeploy previous frontend build artifact from hosting provider.
Frontend is stateless — rollback is instant.

DNS/CDN cache may take 1-5 minutes to propagate.

## Backend Rollback

1. Deploy previous backend Docker image / build
2. DO NOT automatically reverse database migrations
3. Verify: GET /health → 200

## Workers Rollback

Deploy previous worker build. Workers are stateless — no data impact.

## Database Rollback Policy

**StreamVerse uses a forward-fix migration strategy.**

- Do NOT run migration rollbacks automatically
- If a migration introduced a bad column or table: write a new forward migration to fix it
- Only roll back a migration if it was applied in error AND no data has been written to the new structure

### Emergency Data Recovery

If data corruption occurs:
1. Stop writes immediately (enable maintenance mode or take API offline)
2. Restore from the most recent verified backup (see backup docs)
3. Contact database provider support for point-in-time recovery

## Stripe Rollback

Stripe transactions cannot be rolled back from application code.
- Refund payments through Stripe dashboard or `POST /api/v1/admin/payments/:id/refund`
- Stripe webhook events replay from Stripe dashboard → Webhooks → select endpoint → Resend

## What Cannot Be Rolled Back

- Sent emails — notify affected users manually if needed
- Stripe charges — issue refunds
- Published content already served to users

## Rollback Decision Criteria

| Severity | Action |
|---|---|
| Frontend bug | Redeploy previous frontend |
| API bug (no DB change) | Redeploy previous backend |
| API bug (additive DB change) | Redeploy previous backend, leave DB as-is |
| API bug (destructive DB change) | Restore from backup after confirming scope |
| Worker bug | Redeploy previous workers |
