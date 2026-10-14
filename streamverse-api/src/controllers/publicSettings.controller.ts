import type { Request, Response } from "express";
import { getPublicSettings, getAllSettings, updateSettings } from "../services/settings/appSettings.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";

/** GET /api/v1/settings/public — no auth required */
export async function publicList(_req: Request, res: Response) {
  const data = await getPublicSettings();
  sendSuccess(res, data, "Public settings");
}

/** GET /api/v1/admin/settings — admin only */
export async function adminList(_req: Request, res: Response) {
  const data = await getAllSettings();
  sendSuccess(res, data, "All settings");
}

/**
 * PATCH /api/v1/admin/settings
 * Body: { "settings": [{ "key": "maintenanceMode", "value": true }] }
 */
export async function adminUpdateBatch(req: Request, res: Response) {
  const { settings } = req.body as { settings: { key: string; value: unknown }[] };
  const ctx = auditContext(req);
  const updated = await updateSettings(settings, ctx);
  sendSuccess(res, updated, "Settings updated");
}
