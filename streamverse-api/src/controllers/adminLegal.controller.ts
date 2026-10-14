import type { Request, Response } from "express";
import type { LegalDocType } from "@prisma/client";
import * as legalService from "../services/legal.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";
import { NotFoundError } from "../utils/errors";

const TYPES: LegalDocType[] = ["PRIVACY_POLICY", "TERMS_AND_CONDITIONS", "REFUND_POLICY"];

export async function list(_req: Request, res: Response) {
  const docs = await Promise.all(TYPES.map((t) => legalService.getDocument(t)));
  sendSuccess(res, docs.filter(Boolean), "Legal documents");
}

export async function getOne(req: Request, res: Response) {
  const doc = await legalService.getDocument(req.params["type"] as LegalDocType);
  if (!doc) throw new NotFoundError("No legal document is configured for this type");
  sendSuccess(res, doc, "Legal document");
}

/** Section 42: the draft IS the preview — there is no separate publication until POST .../publish. */
export async function preview(req: Request, res: Response) {
  const doc = await legalService.getDocument(req.params["type"] as LegalDocType);
  if (!doc) throw new NotFoundError("No legal document is configured for this type");
  sendSuccess(res, doc.currentDraftVersion ?? doc.currentPublishedVersion, "Preview");
}

export async function saveDraft(req: Request, res: Response) {
  const version = await legalService.saveDraft(req.params["type"] as LegalDocType, req.body, auditContext(req));
  sendSuccess(res, version, "Draft saved");
}

export async function publish(req: Request, res: Response) {
  const version = await legalService.publishDraft(req.params["type"] as LegalDocType, auditContext(req));
  sendSuccess(res, version, "Published");
}

export async function versions(req: Request, res: Response) {
  const list = await legalService.listVersions(req.params["type"] as LegalDocType);
  sendSuccess(res, list, "Version history");
}
