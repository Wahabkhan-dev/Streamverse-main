import type { Request, Response } from "express";
import type { LegalDocType } from "@prisma/client";
import * as legalService from "../services/legal.service";
import { sendSuccess } from "../utils/apiResponse";
import { NotFoundError } from "../utils/errors";

/**
 * Section 53/54: ONLY `currentPublishedVersion` is ever returned here — a draft never leaks, no matter
 * how far along it is. If nothing has been published yet, that is a 404, not an empty/draft fallback.
 */
async function sendPublished(res: Response, type: LegalDocType) {
  const published = await legalService.getPublishedDocument(type);
  if (!published) throw new NotFoundError("This document has not been published yet.");
  sendSuccess(res, published, "Legal document");
}

export const privacyPolicy = (_req: Request, res: Response) => sendPublished(res, "PRIVACY_POLICY");
export const termsAndConditions = (_req: Request, res: Response) => sendPublished(res, "TERMS_AND_CONDITIONS");
export const refundPolicy = (_req: Request, res: Response) => sendPublished(res, "REFUND_POLICY");
