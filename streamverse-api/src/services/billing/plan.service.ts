import * as planRepository from "../../repositories/plan.repository";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import type { AuditContext } from "../auditLog.service";
import { recordAudit } from "../auditLog.service";
import type { CreatePlanInput, UpdatePlanInput } from "../../validators/plan.validator";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

export async function createPlan(input: CreatePlanInput, ctx: AuditContext = NO_ACTOR) {
  if (await planRepository.slugExists(input.slug)) throw new ConflictError(`A plan with slug "${input.slug}" already exists.`);
  if (await planRepository.stripePriceIdExists(input.stripePriceId)) throw new ConflictError("This Stripe Price is already linked to another plan.");
  const plan = await planRepository.create(input);
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

  const updated = await planRepository.update(id, input);
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
  return plan;
}

export const listAdminPlans = planRepository.listAll;

/** Section 12: customer-visible list — active only, no unnecessary Stripe ids exposed. */
export async function listCustomerPlans() {
  const plans = await planRepository.listActive();
  return plans.map(toCustomerPlan);
}

export function toCustomerPlan(plan: { id: string; name: string; slug: string; description: string | null; priceAmount: number; currency: string; billingInterval: string; trialDays: number | null; features: unknown }) {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    price: plan.priceAmount,
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    trialDays: plan.trialDays,
    features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
  };
}

/** Section 9: the ONE place a frontend-supplied planId resolves to a real, active, backend-controlled Stripe Price. */
export async function resolveActivePlanOrThrow(planId: string) {
  const plan = await planRepository.findActiveById(planId);
  if (!plan) throw new ValidationError([{ path: "planId", message: "This plan does not exist or is not available." }]);
  return plan;
}
