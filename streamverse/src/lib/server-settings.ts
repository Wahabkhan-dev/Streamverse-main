import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/api/client";
import { DEMO_MODE } from "@/lib/config";
import { useAuthState } from "@/lib/authState";
import { update, type Settings } from "@/lib/store";

/**
 * The admin Settings screen's names, mapped to the real setting keys the server stores (MySQL `AppSetting`). The server is the
 * source of truth in live mode; the browser store is only a mirror so the wizards and the maintenance screen can read them.
 */
export const SETTING_KEY: Record<keyof Settings, string> = {
  maintenance: "maintenanceMode",
  registration: "registrationEnabled",
  autoPublish: "autoPublishContent",
  ageGate: "ageGateEnabled",
  notifyNew: "newContentAlerts",
  notifyBilling: "billingNotifications",
  autoplayNext: "autoplayNext",
  autoplayPreview: "autoplayPreview",
  defaultLanguage: "defaultLanguage",
};

/** What a setting is when the server has not stored a value for it yet (the same defaults the server applies). */
export const SETTING_DEFAULTS: Settings = {
  maintenance: false,
  registration: true,
  autoPublish: true,
  ageGate: false,
  notifyNew: false,
  notifyBilling: true,
  autoplayNext: true,
  autoplayPreview: true,
  defaultLanguage: "English",
};

/** Older rows hold a language CODE ("en"); the screens work with names ("English"). */
function languageName(v: unknown): string {
  const s = typeof v === "string" && v ? v : SETTING_DEFAULTS.defaultLanguage;
  if (/^[a-z]{2,3}$/i.test(s)) {
    try {
      return new Intl.DisplayNames(["en"], { type: "language" }).of(s.toLowerCase()) ?? s;
    } catch {
      return s;
    }
  }
  return s;
}

export function fromServer(raw: Record<string, unknown> | undefined): Settings {
  const out = { ...SETTING_DEFAULTS } as Record<string, unknown>;
  for (const [name, key] of Object.entries(SETTING_KEY)) {
    const v = raw?.[key];
    if (v !== undefined && v !== null) out[name] = v;
  }
  out["defaultLanguage"] = languageName(out["defaultLanguage"]);
  return out as unknown as Settings;
}

export const toServer = (patch: Partial<Settings>): Record<string, boolean | string> =>
  Object.fromEntries(Object.entries(patch).map(([k, v]) => [SETTING_KEY[k as keyof Settings], v as boolean | string]));

export const SETTINGS_QUERY_KEY = ["admin", "settings"] as const;

/** Admin: the server's settings (merged with defaults), mirrored into the browser store for the screens that read it there. */
export function useServerSettings() {
  const auth = useAuthState();
  const q = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    // only once the server has confirmed an administrator: no 403s from a guest or a customer
    enabled: !DEMO_MODE && auth.status === "authenticated" && auth.user?.role === "admin",
    queryFn: async () => fromServer(((await api.get<{ data: Record<string, unknown> }>("/admin/settings")).data ?? {}) as Record<string, unknown>),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (q.data) update((st) => ({ settings: { ...st.settings, ...q.data } }));
  }, [q.data]);
  return q;
}

/** Admin: save one or more settings to the server, then refresh the screen from what the server now holds. */
export function useSaveSettings() {
  const qc = useQueryClient();
  return async (patch: Partial<Settings>): Promise<void> => {
    await api.put("/admin/settings", toServer(patch));
    await qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
  };
}
