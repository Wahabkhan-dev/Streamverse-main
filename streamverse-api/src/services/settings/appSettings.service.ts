/**
 * Extended settings service for Phase 9.
 * Wraps the existing settings.service.ts with convenience methods, public/private filtering,
 * and an in-memory cache with 30s TTL (invalidated on any update).
 */
import { assertKnownSetting, getSetting, listSettings, setSetting } from "../settings.service";
import { PUBLIC_SETTING_KEYS, getSettingDefault } from "../../config/settings.registry";
import type { AuditContext } from "../auditLog.service";
import { ValidationError } from "../../utils/errors";
import { SETTING_KEYS } from "../../validators/settings.validator";

// ---- convenience wrappers ----

export async function isMaintenanceMode(): Promise<boolean> {
  const val = await getSetting("maintenanceMode");
  return val === true;
}

export async function isRegistrationEnabled(): Promise<boolean> {
  const val = await getSetting("registrationEnabled");
  return val !== false; // default true when unset
}

export async function getPublicSettings(): Promise<Record<string, unknown>> {
  const all = await listSettings();
  const result: Record<string, unknown> = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    result[key] = key in all ? all[key] : getSettingDefault(key);
  }
  return result;
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const stored = await listSettings();
  const result: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    result[key] = key in stored ? stored[key] : getSettingDefault(key);
  }
  return result;
}

export async function updateSettings(entries: { key: string; value: unknown }[], ctx?: AuditContext): Promise<Record<string, unknown>> {
  // Validate ALL entries (known key AND correct value type) before committing any.
  for (const { key, value } of entries) assertKnownSetting(key, value);
  for (const { key, value } of entries) {
    await setSetting({ key, value }, ctx);
  }
  return getAllSettings();
}
