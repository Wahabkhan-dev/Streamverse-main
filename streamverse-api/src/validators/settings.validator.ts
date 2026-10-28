import { z } from "zod";

/** The only keys the app recognizes (Section 37): no new column is added per setting, but the key set is still fixed and validated. */
export const SETTING_DEFINITIONS = {
  maintenanceMode: "BOOLEAN",
  registrationEnabled: "BOOLEAN",
  ageGateEnabled: "BOOLEAN",
  defaultLanguage: "STRING",
  billingNotifications: "BOOLEAN",
  newContentAlerts: "BOOLEAN",
  autoplayDefaults: "BOOLEAN",
  autoPublishContent: "BOOLEAN",
  autoplayNext: "BOOLEAN",
  autoplayPreview: "BOOLEAN",
} as const;
export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

export const settingKeySchema = z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]);

export const settingValueSchema = z.object({ key: settingKeySchema, value: z.union([z.boolean(), z.string(), z.number()]) });
export type SettingValueInput = z.infer<typeof settingValueSchema>;

/** Body for PUT /admin/settings/:key — the key is in the URL, this is just the value. */
export const settingValueBodySchema = z.object({ value: z.union([z.boolean(), z.string(), z.number()]) });

/** Body for the batched PUT /admin/settings. */
export const settingsBatchSchema = z.record(z.string(), z.union([z.boolean(), z.string(), z.number()]));
