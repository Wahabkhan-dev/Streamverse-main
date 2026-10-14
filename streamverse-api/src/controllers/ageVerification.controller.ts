/**
 * Phase 8: age verification endpoints.
 *
 * POST /api/v1/me/age-verification — submit date of birth (method = "SELF_DECLARED").
 * GET  /api/v1/me/age-verification — return safe status (never the raw dateOfBirth).
 *
 * The raw DOB is stored in UserAgeVerification but is NEVER returned to the client.
 */
import type { Request, Response } from "express";
import { calculateAge } from "../services/entitlement/entitlement.service";
import * as ageVerificationRepository from "../repositories/ageVerification.repository";
import * as cache from "../services/entitlement/entitlementCache.service";
import { sendSuccess } from "../utils/apiResponse";
import { NotFoundError } from "../utils/errors";
import type { SubmitAgeVerificationInput } from "../validators/ageVerification.validator";

export async function submit(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const { dateOfBirth } = req.body as SubmitAgeVerificationInput;

  const verifiedAge = calculateAge(dateOfBirth);
  await ageVerificationRepository.upsert(userId, {
    dateOfBirth,
    verifiedAge,
    method: "SELF_DECLARED",
    verifiedAt: new Date(),
  });

  // Invalidate any cached entitlement decisions for this user (age may now unlock content)
  cache.invalidateUser(userId);

  return sendSuccess(
    res,
    {
      method: "SELF_DECLARED",
      verifiedAt: new Date().toISOString(),
      ageConfirmed: true,
    },
    "Age verification submitted",
    201,
  );
}

export async function getStatus(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const record = await ageVerificationRepository.findByUserId(userId);

  if (!record) {
    return sendSuccess(res, { ageConfirmed: false, method: null, verifiedAt: null }, "Age verification status");
  }

  // Recompute age (DOB is stored; we just re-derive it, never return it)
  const ageConfirmed = record.dateOfBirth !== null || record.verifiedAge !== null;

  return sendSuccess(
    res,
    {
      ageConfirmed,
      method: record.method,
      verifiedAt: record.verifiedAt.toISOString(),
      expiresAt: record.expiresAt?.toISOString() ?? null,
    },
    "Age verification status",
  );
}
