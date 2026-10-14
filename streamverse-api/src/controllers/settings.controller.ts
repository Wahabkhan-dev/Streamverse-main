import type { Request, Response } from "express";
import * as settingsService from "../services/settings.service";
import { getAllSettings, updateSettings } from "../services/settings/appSettings.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(_req: Request, res: Response) {
  // Phase 9: return all known keys with defaults, not just stored rows
  sendSuccess(res, await getAllSettings(), "Settings");
}

export async function update(req: Request, res: Response) {
  await settingsService.setSetting({ key: req.params["key"]!, value: req.body.value }, auditContext(req));
  sendSuccess(res, await settingsService.listSettings(), "Setting updated");
}

/** Batched update: `{ "maintenanceMode": false, "defaultLanguage": "en" }`. */
export async function updateBatch(req: Request, res: Response) {
  const entries = Object.entries(req.body as Record<string, unknown>).map(([key, value]) => ({ key, value }));
  const updated = await updateSettings(entries, auditContext(req));
  sendSuccess(res, updated, "Settings updated");
}
