/**
 * Phase 8: THE authoritative entitlement service.
 *
 * `checkAccess(context, contentId, contentType)` is the single entry-point for any access decision on
 * playback/consumption routes. Every check (publish state, visibility, availability windows, territory,
 * age, subscription) runs here in a fixed, documented order. Nothing in any controller re-implements this.
 *
 * ADMIN role bypasses all customer-facing restrictions — admins can always consume any content.
 */
import * as entitlementRepository from "../../repositories/entitlement.repository";
import * as ageVerificationRepository from "../../repositories/ageVerification.repository";
import { checkSubscriptionAccess } from "../billing/subscriptionAccess.service";
import * as cache from "./entitlementCache.service";
import { logAccess } from "./accessAudit.service";

/* ------------------------------------------------------------------ Types */

export interface AccessContext {
  userId?: string;
  role?: "USER" | "ADMIN";
  /** "ACTIVE" | "SUSPENDED" — from user.status; undefined for anonymous */
  accountStatus?: string;
  /** ISO 3166-1 alpha-2, e.g. "US", "GB" — from user.country */
  country?: string;
  /** Optional: request id for audit correlation */
  requestId?: string;
  /** Optional: client IP for audit */
  ip?: string;
}

export interface AccessDecision {
  allowed: boolean;
  canViewMetadata: boolean;
  canConsume: boolean;
  reason?: AccessDenialReason;
  details?: Record<string, unknown>;
}

export type AccessDenialReason =
  | "AUTH_REQUIRED"
  | "ACCOUNT_SUSPENDED"
  | "CONTENT_NOT_FOUND"
  | "CONTENT_UNAVAILABLE"
  | "NOT_PUBLISHED"
  | "SUBSCRIPTION_REQUIRED"
  | "SUBSCRIPTION_INACTIVE"
  | "AGE_RESTRICTED"
  | "AGE_NOT_VERIFIED"
  | "REGION_RESTRICTED"
  | "NOT_YET_AVAILABLE"
  | "AVAILABILITY_EXPIRED"
  | "MEDIA_NOT_READY"
  | "PLAN_NOT_ELIGIBLE";

/* ------------------------------------------------------------------ Helpers */

/** Correct birthday-aware age calculation. Example: born 2000-10-15, today 2026-10-12 → 25. */
export function calculateAge(dob: Date, now: Date = new Date()): number {
  const years = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    return years - 1;
  }
  return years;
}

function deny(reason: AccessDenialReason, canViewMetadata = false): AccessDecision {
  return { allowed: false, canViewMetadata, canConsume: false, reason };
}

function allow(): AccessDecision {
  return { allowed: true, canViewMetadata: true, canConsume: true };
}

/* ------------------------------------------------------------------ Territory */

/**
 * Phase 8 territory check.
 * When territoryMode is INCLUDE or EXCLUDE and the user has no country, we DENY (safe default).
 * This differs from the Phase 5 placeholder which passed unknown-country through.
 */
export function evaluateTerritoryAccess(
  territoryMode: string,
  territoryCodes: string[],
  userCountry: string | null | undefined,
): "PASS" | "REGION_RESTRICTED" {
  if (territoryMode === "WORLDWIDE") return "PASS";
  // user country unknown + non-WORLDWIDE restriction → deny
  if (!userCountry) return "REGION_RESTRICTED";
  const inList = territoryCodes.includes(userCountry.toUpperCase());
  if (territoryMode === "INCLUDE" && !inList) return "REGION_RESTRICTED";
  if (territoryMode === "EXCLUDE" && inList) return "REGION_RESTRICTED";
  return "PASS";
}

/* ------------------------------------------------------------------ Core */

/**
 * The ONE function every playback/consumption route calls.
 *
 * Checks run in this fixed order (skip ahead on the first failure):
 *  1. Content exists?
 *  2. Soft-deleted?
 *  3. Status published (or SCHEDULED past publishAt)?
 *  4. Visibility HIDDEN?
 *  5. Availability window (availableFrom / availableUntil)
 *  6. Auth required for SUBSCRIBERS_ONLY?
 *  7. Account suspended?
 *  8. Territory restriction?
 *  9. Age restriction?
 * 10. Subscription check?
 * 11. → ALLOWED
 */
export async function checkAccess(
  context: AccessContext,
  contentId: string,
  contentType: "movie" | "audiobook" | "ebook",
): Promise<AccessDecision> {
  // ADMIN bypass — admins can always view and consume any content
  if (context.role === "ADMIN") return allow();

  // Entitlement cache (skip if disabled)
  const key = cache.cacheKey(context.userId, contentId, contentType);
  const cached = cache.get(key);
  if (cached) return cached;

  const now = new Date();
  let decision: AccessDecision;

  try {
    // 1 & 2. Content exists and not soft-deleted?
    const content = await entitlementRepository.findContentForEntitlement(contentId);
    if (!content || content.deletedAt) {
      decision = deny("CONTENT_NOT_FOUND");
      return decision;
    }

    // 3. Status check: must be PUBLISHED, or SCHEDULED with publishAt in the past
    const isPublished = content.status === "PUBLISHED";
    const isScheduledLive = content.status === "SCHEDULED" && !!content.publishAt && content.publishAt <= now;
    if (!isPublished && !isScheduledLive) {
      const reason = content.status === "SCHEDULED" ? "NOT_YET_AVAILABLE" : content.status === "ARCHIVED" ? "CONTENT_UNAVAILABLE" : "NOT_PUBLISHED";
      decision = deny(reason);
      return decision;
    }

    // 4. Visibility HIDDEN → treat as not found (hides existence from customers)
    if (content.visibility === "HIDDEN") {
      decision = deny("CONTENT_NOT_FOUND");
      return decision;
    }

    // 5. Availability window
    if (content.availableFrom && content.availableFrom > now) {
      decision = deny("NOT_YET_AVAILABLE", true);
      return decision;
    }
    if (content.availableUntil && content.availableUntil < now) {
      decision = deny("AVAILABILITY_EXPIRED", true);
      return decision;
    }

    // From here, metadata is visible to anyone.
    // The remaining checks determine whether the user can actually CONSUME.

    // 6. SUBSCRIBERS_ONLY content requires authentication
    if (content.visibility === "SUBSCRIBERS_ONLY" && !context.userId) {
      decision = deny("AUTH_REQUIRED", true);
      return decision;
    }

    // 7. Account suspended (authenticated users only)
    if (context.userId && context.accountStatus === "SUSPENDED") {
      decision = deny("ACCOUNT_SUSPENDED", true);
      return decision;
    }

    // 8. Territory restriction
    const territoryCodes = content.territories.map((t) => t.countryCode);
    const territoryResult = evaluateTerritoryAccess(content.territoryMode, territoryCodes, context.country);
    if (territoryResult !== "PASS") {
      decision = deny("REGION_RESTRICTED", true);
      return decision;
    }

    // 9. Age restriction
    if (content.ageRestricted) {
      if (!context.userId) {
        decision = deny("AGE_NOT_VERIFIED", true);
        return decision;
      }
      const ageVerif = await ageVerificationRepository.findByUserId(context.userId);
      if (!ageVerif) {
        decision = deny("AGE_NOT_VERIFIED", true);
        return decision;
      }
      // Guard: ageRestricted content with no minimumAge set is unavailable
      if (content.minimumAge === null) {
        decision = deny("CONTENT_UNAVAILABLE");
        return decision;
      }
      // Compute age from dateOfBirth (or use stored verifiedAge)
      const userAge = ageVerif.dateOfBirth ? calculateAge(ageVerif.dateOfBirth, now) : (ageVerif.verifiedAge ?? 0);
      if (userAge < content.minimumAge) {
        decision = deny("AGE_RESTRICTED", true);
        return decision;
      }
    }

    // 10. Subscription check (only for SUBSCRIBERS_ONLY content)
    if (content.visibility === "SUBSCRIBERS_ONLY") {
      // userId is guaranteed to exist here (step 6 already caught anonymous)
      const subAccess = await checkSubscriptionAccess(context.userId!);
      if (!subAccess.hasAccess) {
        const reason = subAccess.hasSubscription ? "SUBSCRIPTION_INACTIVE" : "SUBSCRIPTION_REQUIRED";
        decision = deny(reason, true);
        return decision;
      }
    }

    // 11. All checks passed
    decision = allow();
    return decision;
  } finally {
    // Cache the decision (if we have one — finally always runs)
    if (decision!) {
      cache.set(key, decision);
      logAccess({
        userId: context.userId,
        contentId,
        contentType,
        decision,
        requestId: context.requestId,
        ip: context.ip,
      });
    }
  }
}
