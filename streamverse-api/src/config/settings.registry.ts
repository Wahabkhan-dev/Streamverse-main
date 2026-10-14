/**
 * The authoritative registry of all application settings.
 * `public: true` means the setting is safe to expose via GET /api/v1/settings/public (no auth).
 * `type` mirrors the SettingValueType enum so validation and serialization are consistent.
 */

export interface SettingDefinition {
  key: string;
  type: "boolean" | "string" | "number" | "json";
  default: unknown;
  public: boolean;
  description: string;
}

export const SETTINGS_REGISTRY: SettingDefinition[] = [
  {
    key: "maintenanceMode",
    type: "boolean",
    default: false,
    public: true,
    description: "When true, all non-admin requests return 503 MAINTENANCE_MODE.",
  },
  {
    key: "registrationEnabled",
    type: "boolean",
    default: true,
    public: true,
    description: "When false, new user registrations are blocked with 403 REGISTRATION_DISABLED.",
  },
  {
    key: "ageGateEnabled",
    type: "boolean",
    default: false,
    public: true,
    description: "When true, age-restricted content requires verified age.",
  },
  {
    key: "defaultLanguage",
    type: "string",
    default: "en",
    public: true,
    description: "Default UI language code (ISO 639-1).",
  },
  {
    key: "autoplayDefaults",
    type: "boolean",
    default: true,
    public: true,
    description: "Default autoplay preference for new users.",
  },
  {
    key: "newContentAlerts",
    type: "boolean",
    default: false,
    public: false,
    description: "Whether to send new-content notification emails.",
  },
  {
    key: "billingNotifications",
    type: "boolean",
    default: true,
    public: false,
    description: "Whether to send billing-related notification emails.",
  },
];

export const PUBLIC_SETTING_KEYS = new Set(SETTINGS_REGISTRY.filter((s) => s.public).map((s) => s.key));

export function getSettingDefault(key: string): unknown {
  return SETTINGS_REGISTRY.find((s) => s.key === key)?.default;
}
