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
    description: "Language pre-selected as the Primary Language when adding content (the language name, e.g. English).",
  },
  {
    key: "autoplayDefaults",
    type: "boolean",
    default: true,
    public: true,
    description: "Default autoplay preference for new users.",
  },
  {
    key: "autoPublishContent",
    type: "boolean",
    default: true,
    public: false,
    description: "New titles open the Publish step with Publish now already selected.",
  },
  {
    key: "autoplayNext",
    type: "boolean",
    default: true,
    public: true,
    description: "Offer the next title when a movie ends (a customer can turn it off in Profile).",
  },
  {
    key: "autoplayPreview",
    type: "boolean",
    default: true,
    public: true,
    description: "Rotate the homepage hero automatically (a customer can turn it off in Profile).",
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
