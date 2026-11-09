/**
 * The one place that decides what a customer may see and consume (Section 3). Every customer-facing
 * list/detail/search/homepage/collection/banner/My-List/Library/History/Progress read goes through
 * `isCustomerVisible` (for "does this exist for customers at all") and, where a detail page needs it,
 * `evaluateAccess` (for "can *this* customer actually open it, and if not, why").
 */
import type { TerritoryMode, Visibility } from "@prisma/client";
import * as userRepository from "../repositories/user.repository";
import * as ageVerificationRepository from "../repositories/ageVerification.repository";
import { hasActiveAccess } from "./billing/subscriptionAccess.service";
import { calculateAge } from "./entitlement/entitlement.service";

export type AccessReason = "SUBSCRIPTION_REQUIRED" | "AGE_RESTRICTED" | "REGION_RESTRICTED" | "NOT_YET_AVAILABLE" | "EXPIRED" | "UNAVAILABLE";

export interface AccessResult {
  canViewMetadata: boolean;
  canConsume: boolean;
  reason?: AccessReason;
}

/** The subset of Content this service needs — callers pass the real row, this just declares the shape. */
export interface AccessibleContent {
  status: string;
  deletedAt: Date | null;
  visibility: Visibility;
  ageRestricted: boolean;
  minimumAge: number | null;
  territoryMode: TerritoryMode;
  availableFrom: Date | null;
  availableUntil: Date | null;
}

/** The subset of the authenticated user this service needs. Undefined = not logged in. */
export interface AccessUser {
  country: string | null;
  /// Phase 7 (Section 59): real Stripe-backed subscription state, via `subscriptionAccess.service.ts`.
  hasActiveSubscription: boolean;
  ageVerified: boolean;
  /** Today's age from the verified date of birth (null when unknown) — compared with the title's minimumAge, as playback does. */
  age?: number | null;
}

/**
 * Section 2: customer discovery (lists, search, homepage, collections, banners) always filters to this.
 * PUBLISHED + not soft-deleted + not HIDDEN + inside its availability window. DRAFT, SCHEDULED,
 * UNPUBLISHED, ARCHIVED, PROCESSING and PROCESSING_FAILED are all excluded — SCHEDULED only becomes
 * visible once an admin actually publishes it (Section 60): no background worker promotes it by time in
 * this phase, so "publish state/time rules" currently means exactly that explicit admin action.
 */
export function isCustomerVisible(content: AccessibleContent, now = new Date()): boolean {
  if (content.status !== "PUBLISHED") return false;
  if (content.deletedAt) return false;
  if (content.visibility === "HIDDEN") return false;
  if (content.availableFrom && content.availableFrom > now) return false;
  if (content.availableUntil && content.availableUntil < now) return false;
  return true;
}

/**
 * Section 55: structured access info for a detail page. `canViewMetadata` mirrors `isCustomerVisible`
 * (a customer can at least see the page); `canConsume` additionally applies subscription/age/territory/
 * availability-window rules, in a fixed priority order, and names exactly one reason when blocked.
 */
export function evaluateAccess(content: AccessibleContent, user: AccessUser | undefined, countryCodes: string[], now = new Date()): AccessResult {
  const canViewMetadata = isCustomerVisible(content, now);
  if (!canViewMetadata) return { canViewMetadata: false, canConsume: false, reason: "UNAVAILABLE" };

  if (content.availableFrom && content.availableFrom > now) return { canViewMetadata, canConsume: false, reason: "NOT_YET_AVAILABLE" };
  if (content.availableUntil && content.availableUntil < now) return { canViewMetadata, canConsume: false, reason: "EXPIRED" };

  if (isRegionRestrictedForUser(content.territoryMode, countryCodes, user?.country)) return { canViewMetadata, canConsume: false, reason: "REGION_RESTRICTED" };

  if (content.visibility === "SUBSCRIBERS_ONLY" && !user?.hasActiveSubscription) return { canViewMetadata, canConsume: false, reason: "SUBSCRIPTION_REQUIRED" };

  // same rule as playback (entitlement.service): a verified age at or above the title's minimum age; no minimum set = not openable
  if (content.ageRestricted && (!user?.ageVerified || content.minimumAge === null || (user.age ?? 0) < content.minimumAge)) return { canViewMetadata, canConsume: false, reason: "AGE_RESTRICTED" };

  return { canViewMetadata: true, canConsume: true };
}

/** `req.auth?.userId` -> the fields evaluateAccess needs, or undefined for an anonymous visitor. */
export async function loadAccessUser(userId: string | undefined, knownUser?: { id: string; country: string | null }): Promise<AccessUser | undefined> {
  if (!userId) return undefined;
  // asked together: each one is a round trip to the database, so in a row they add up on every title page. `knownUser` is the
  // account the auth middleware already loaded on this same request — reused instead of read again.
  const [user, ageVerif, hasActiveSubscription] = await Promise.all([
    knownUser?.id === userId ? knownUser : userRepository.findById(userId),
    ageVerificationRepository.findByUserId(userId),
    hasActiveAccess(userId),
  ]);
  if (!user) return undefined;
  const age = ageVerif ? (ageVerif.dateOfBirth ? calculateAge(ageVerif.dateOfBirth) : (ageVerif.verifiedAge ?? null)) : null;
  return { country: user.country, hasActiveSubscription, ageVerified: ageVerif !== null && ageVerif !== undefined, age };
}

/** Section 59: a reliable country needs a signed-in user with one set — no geolocation is invented here. */
export function isRegionRestrictedForUser(territoryMode: TerritoryMode, countryCodes: string[], userCountry: string | null | undefined): boolean {
  if (territoryMode === "WORLDWIDE" || !userCountry) return false;
  const inList = countryCodes.includes(userCountry);
  return (territoryMode === "INCLUDE" && !inList) || (territoryMode === "EXCLUDE" && inList);
}
