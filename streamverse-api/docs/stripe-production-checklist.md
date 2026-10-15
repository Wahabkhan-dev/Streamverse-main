# Stripe Production Checklist

## Before Switching to Live Mode

- [ ] All smoke tests pass in Test Mode
- [ ] Backend uses sk_test_… confirmed working
- [ ] Webhook delivery confirmed in Stripe Test dashboard

## Live Keys

- [ ] Obtain sk_live_… from Stripe dashboard → API Keys
- [ ] Set STRIPE_SECRET_KEY=sk_live_… in production secret manager
- [ ] Set VITE_STRIPE_PUBLISHABLE_KEY=pk_live_… in frontend production env
- [ ] NEVER commit either key

## Live Products & Prices

Test-mode Product/Price IDs cannot be reused in live mode.

For each plan in Admin → Plans:
- [ ] Create corresponding Product in Stripe Live Mode
- [ ] Create monthly Price under that Product
- [ ] Create yearly Price under that Product
- [ ] Update PlanPrice records in production DB with live stripeProductId and stripePriceId

## Live Webhook

- [ ] In Stripe dashboard → Webhooks → Add endpoint
- [ ] URL: `https://api.streamverse.com/api/v1/stripe/webhook` (exact path from src/routes/webhook.routes.ts)
- [ ] Events to subscribe:
  - checkout.session.completed
  - customer.subscription.created
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.paid
  - invoice.payment_failed
  - charge.refunded
- [ ] Copy live signing secret (whsec_live_…) to STRIPE_WEBHOOK_SECRET
- [ ] Verify: send test event from Stripe dashboard → backend receives and returns 200

## Customer Portal

- [ ] Configure in Stripe dashboard → Customer Portal
- [ ] Allow: plan changes, payment method updates, cancellation
- [ ] Set return URL: https://streamverse.com/subscription
- [ ] Set invoice history: enabled

## Checkout Redirect URLs

- [ ] Success URL: `https://streamverse.com/signup/complete?session_id={CHECKOUT_SESSION_ID}`
- [ ] Cancel URL: `https://streamverse.com/signup/payment`

Verify these match frontend routes exactly (signup.complete.tsx and signup.payment.tsx).

## Currency

- [ ] Confirm all PlanPrice currency values match Stripe Live Price currencies
- [ ] Do not mix USD and non-USD prices accidentally

## Tax

**TAX CONFIGURATION: BUSINESS DECISION REQUIRED**

- If Stripe Tax is needed: configure in Stripe dashboard → Tax settings
- If not: no action needed; document explicitly that tax is excluded from prices

## Refund Flow

- Refunds triggered via Admin console → Payments → Refund (admin.payments.tsx)
- Refunded amounts credited to original payment method
- Confirm refund shows in Stripe dashboard

## Test/Live Separation Verification

Before go-live:
- [ ] Search codebase for sk_test_ → 0 results in production config
- [ ] Search codebase for price_test_ or prod_test_ → 0 results
- [ ] Verify STRIPE_SECRET_KEY starts with sk_live_
- [ ] Verify STRIPE_WEBHOOK_SECRET starts with whsec_ (live, not test)

## Post-Launch

- [ ] Confirm first real subscription in Stripe dashboard
- [ ] Confirm webhook delivered successfully
- [ ] Check StripeEvent table — status should be PROCESSED
- [ ] Monitor invoice.payment_failed events for the first 30 days
