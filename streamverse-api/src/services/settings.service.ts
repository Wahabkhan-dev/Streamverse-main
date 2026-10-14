import * as settingsRepository from "../repositories/settings.repository";
import { SETTING_DEFINITIONS, SETTING_KEYS, type SettingKey } from "../validators/settings.validator";
import { ValidationError } from "../utils/errors";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { invalidateMaintenanceCache } from "../utils/maintenanceModeCache";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

/** Stored as text (Section 37); parsed back to its real type using the `type` column written alongside it. */
function parseValue(raw: string, type: "BOOLEAN" | "STRING" | "NUMBER" | "JSON"): unknown {
  if (type === "BOOLEAN") return raw === "true";
  if (type === "NUMBER") return Number(raw);
  if (type === "JSON") return JSON.parse(raw);
  return raw;
}
const serializeValue = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

export async function getSetting(key: SettingKey) {
  const row = await settingsRepository.findByKey(key);
  return row ? parseValue(row.value, row.type) : undefined;
}

export async function listSettings(): Promise<Record<string, unknown>> {
  const rows = await settingsRepository.list();
  return Object.fromEntries(rows.map((r) => [r.key, parseValue(r.value, r.type)]));
}

const typeOf = (v: unknown) => (typeof v === "boolean" ? "BOOLEAN" : typeof v === "number" ? "NUMBER" : "STRING");

/** Section 44: only known keys, and only the right JS type for that key — never an unchecked arbitrary string. */
export function assertKnownSetting(key: string, value: unknown): asserts key is SettingKey {
  if (!SETTING_KEYS.includes(key as SettingKey)) throw new ValidationError([{ path: "key", message: `Unknown setting "${key}".` }]);
  // every currently-known setting is BOOLEAN or STRING; this still protects a JSON-typed key added later
  const expected: string = SETTING_DEFINITIONS[key as SettingKey];
  if (expected !== "JSON" && typeOf(value) !== expected) throw new ValidationError([{ path: "value", message: `"${key}" expects a ${expected.toLowerCase()} value.` }]);
}

/** Section 73: logs oldValue/newValue. Settings never carry secrets, so there is nothing to redact here. */
export async function setSetting(input: { key: string; value: unknown }, ctx: AuditContext = NO_ACTOR) {
  assertKnownSetting(input.key, input.value);
  const type = SETTING_DEFINITIONS[input.key];
  const before = await settingsRepository.findByKey(input.key);
  const oldValue = before ? parseValue(before.value, before.type) : undefined;
  const updated = await settingsRepository.upsert(input.key, serializeValue(input.value), type, ctx.userId);
  await recordAudit(ctx, { action: "settings.updated", entityType: "APP_SETTING", entityId: input.key, metadata: { oldValue, newValue: input.value } });
  // Invalidate the maintenance-mode in-process cache so the guard picks up the change immediately.
  if (input.key === "maintenanceMode") invalidateMaintenanceCache();
  return updated;
}
