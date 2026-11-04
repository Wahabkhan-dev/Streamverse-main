import { ERROR_CODES } from "../../constants/errors";
import * as planRepository from "../../repositories/plan.repository";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import type { AuditContext } from "../auditLog.service";
import { recordAudit } from "../auditLog.service";
import type { CreatePlanInput, UpdatePlanInput } from "../../validators/plan.validator";
import { analyticsCache, publicCacheWindow } from "../../utils/analyticsCache";
import * as entitlementCache from "../entitlement/entitlementCache.service";
import { stripeConfig } from "../../config/stripe.config";
import * as stripeService from "../stripe/stripe.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

/** Ids that stand in for "no real Stripe Price yet" (offline/demo seeds, or a plan repriced while Stripe was unreachable). */
const isPlaceholderPrice = (id: string) => /^price_(offline|demo|pending)_/.test(id);
const placeholderFor = (slug: string) => `price_pending_${slug}_${Date.now().toString(36)}`;
const stripeConfigured = () => Boolean(stripeConfig.secretKey);

type PlanRow = NonNullable<Awaited<ReturnType<typeof planRepository.findById>>>;

/**
 * Makes Stripe charge exactly what Admin set: creates the plan's Product once, then a Price for its current
 * amount/currency/interval, and stores both ids. Prices are immutable in Stripe, so a price change is a new Price here.
 * The idempotency key covers the exact amount, so a retry never creates a duplicate.
 */
async function syncStripePrice(plan: PlanRow): Promise<PlanRow> {
  let productId = plan.stripeProductId;
  if (!productId) {
    productId = (await stripeService.createProduct({ name: plan.name, description: plan.description, planId: plan.id, idempotencyKey: `plan-product-${plan.id}` })).id;
  }
  const price = await stripeService.createRecurringPrice({
    productId,
    amount: plan.priceAmount,
    currency: plan.currency,
    interval: plan.billingInterval === "YEARLY" ? "year" : "month",
    planId: plan.id,
    idempotencyKey: `plan-price-${plan.id}-${plan.priceAmount}-${plan.currency}-${plan.billingInterval}`,
  });
  return planRepository.update(plan.id, { stripeProductId: productId, stripePriceId: price.id });
}

export async function createPlan(input: CreatePlanInput, ctx: AuditContext = NO_ACTOR) {
  if (await planRepository.slugExists(input.slug)) throw new ConflictError(`A plan with slug "${input.slug}" already exists.`);
  if (input.stripePriceId && (await planRepository.stripePriceIdExists(input.stripePriceId))) throw new ConflictError("This Stripe Price is already linked to another plan.");
  const linked = Boolean(input.stripePriceId);
  let plan = await planRepository.create({ ...input, stripePriceId: input.stripePriceId ?? placeholderFor(input.slug) });
  if (!linked && stripeConfigured()) plan = await syncStripePrice(plan);
  await recordAudit(ctx, { action: "plan.created", entityType: "PLAN", entityId: plan.id, metadata: { slug: plan.slug, stripePriceId: plan.stripePriceId } });
  return plan;
}

/**
 * Section 11: Stripe Price amounts are effectively immutable. If `stripePriceId` changes here, that is
 * expected to be a NEW Stripe Price Admin created for a pricing change — `priceAmount`/`currency` are
 * updated alongside it in the same call, but nothing here ever mutates a price retroactively on
 * historical Subscription/Payment rows, which keep whatever `stripePriceId`/`amount` they were created
 * with (Section 80/114).
 */
export async function updatePlan(id: string, input: UpdatePlanInput, ctx: AuditContext = NO_ACTOR) {
  const existing = await planRepository.findById(id);
  if (!existing) throw new NotFoundError("Plan not found");
  if (input.slug && (await planRepository.slugExists(input.slug, id))) throw new ConflictError(`A plan with slug "${input.slug}" already exists.`);
  if (input.stripePriceId && (await planRepository.stripePriceIdExists(input.stripePriceId, id))) throw new ConflictError("This Stripe Price is already linked to another plan.");

  let updated = await planRepository.update(id, input);
  // limits and included content are read at the moment of access: drop every remembered decision so the change applies right now
  entitlementCache.clear();
  // The price Admin sees must be the price Stripe charges. If the amount, currency or interval changed (and Admin did not link a
  // specific Stripe Price), mint a new Price now; if Stripe is not configured, park the plan on a placeholder so checkout refuses
  // instead of charging the old amount, and the first checkout after Stripe is set up creates the right Price.
  const priceChanged =
    (input.priceAmount !== undefined && input.priceAmount !== existing.priceAmount) ||
    (input.currency !== undefined && input.currency !== existing.currency) ||
    (input.billingInterval !== undefined && input.billingInterval !== existing.billingInterval);
  if (priceChanged && !input.stripePriceId) {
    if (stripeConfigured()) updated = await syncStripePrice(updated);
    else if (!isPlaceholderPrice(updated.stripePriceId)) updated = await planRepository.update(id, { stripePriceId: placeholderFor(updated.slug) });
  }
  await recordAudit(ctx, { action: "plan.updated", entityType: "PLAN", entityId: id, metadata: { fields: Object.keys(input) } });
  return updated;
}

/** Section 10/114: deactivate, never hard-delete — a plan referenced by a Subscription/Payment stays referenceable forever. */
export async function deactivatePlan(id: string, ctx: AuditContext = NO_ACTOR) {
  return updatePlan(id, { active: false }, ctx);
}

export async function getPlan(id: string) {
  const plan = await planRepository.findById(id);
  if (!plan) throw new NotFoundError("Plan not found");
  return { ...plan, subscriberCount: await planRepository.countSubscribers(plan.id) };
}

/** Every plan with how many customers are on it, so Admin can see who a change to its limits will reach. */
export async function listAdminPlans() {
  const plans = await planRepository.listAll();
  return Promise.all(plans.map(async (p) => ({ ...p, subscriberCount: await planRepository.countSubscribers(p.id) })));
}

/** Section 12: customer-visible list — active only, no unnecessary Stripe ids exposed. */
export function listCustomerPlans() {
  // Public and identical for every visitor; cached briefly. Any admin write (see admin.routes.ts) drops the "homepage:" prefix.
  const { ttl, stale } = publicCacheWindow();
  return analyticsCache.getOrSet("homepage:plans:public", async () => (await planRepository.listActive()).map(toCustomerPlan), ttl, stale);
}

export function toCustomerPlan(plan: { id: string; name: string; slug: string; description: string | null; priceAmount: number; currency: string; billingInterval: string; trialDays: number | null; features: unknown; maxDevices?: number | null; maxConcurrentStreams?: number | null; maxVideoQuality?: string | null; moviesEnabled?: boolean; ebooksEnabled?: boolean; audiobooksEnabled?: boolean }) {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    price: plan.priceAmount,
    /** same value under the name the web app reads (minor units) */
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    trialDays: plan.trialDays,
    features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
    // null = unlimited / unrestricted
    maxDevices: plan.maxDevices ?? null,
    maxConcurrentStreams: plan.maxConcurrentStreams ?? null,
    maxVideoQuality: plan.maxVideoQuality ?? null,
    moviesEnabled: plan.moviesEnabled ?? true,
    ebooksEnabled: plan.ebooksEnabled ?? false,
    audiobooksEnabled: plan.audiobooksEnabled ?? false,
  };
}

/** Section 9: the ONE place a frontend-supplied planId resolves to a real, active, backend-controlled Stripe Price. */
export async function resolveActivePlanOrThrow(planId: string) {
  const plan = await planRepository.findActiveById(planId);
  if (!plan) throw new ValidationError([{ path: "planId", message: "This plan does not exist or is not available." }]);
  // a plan with no real Stripe Price yet (seeded offline/demo, or just repriced): create it from the amount Admin set. Never send a placeholder to Stripe.
  if (isPlaceholderPrice(plan.stripePriceId) && stripeConfigured()) return syncStripePrice(plan);
  if (isPlaceholderPrice(plan.stripePriceId)) throw new AppError("Payments are not set up for this plan yet. Please try again later.", 503, ERROR_CODES.SERVICE_UNAVAILABLE);
  return plan;
}
