import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { adminUser } from "@/components/sv/admin";
import { BackendBadge, showBackendNotice } from "@/components/sv/BackendNotice";
import { Btn, PageHeader, Panel, PanelHeader, SelectInput, Skel, Toggle } from "@/components/sv/ui";
import { LANGUAGES } from "@/components/sv/wizard/kit";
import { update, useSettings, type Settings } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useSaveSettings, useServerSettings } from "@/lib/server-settings";
import { isApiError } from "@/api/client";

export const Route = createFileRoute("/admin/settings")({ component: SettingsPage });

type BoolKey = Exclude<keyof Settings, "defaultLanguage">;
interface Row {
  group: string;
  key: BoolKey;
  label: string;
  copy: string;
  /** what turning it on or off does right now */
  effect: string;
  backend?: boolean;
}
const rows: Row[] = [
  { group: "Platform", key: "maintenance", label: "Maintenance mode", copy: "Temporarily show an offline message to customers.", effect: "Customers see a “We'll be right back” page." },
  { group: "Platform", key: "registration", label: "Allow new registrations", copy: "New customers can create a USER account.", effect: "When off, new sign-ups are refused with a clear message." },
  { group: "Catalog", key: "autoPublish", label: "Auto-publish content", copy: "New titles open the Publish step with “Publish now” already selected.", effect: "When off, nothing is selected, so nothing goes live until you choose Publish now or Schedule." },
  { group: "Safety", key: "ageGate", label: "Age restriction gate", copy: "Ask customers to confirm their age before opening restricted titles.", effect: "Controls the age-confirmation screen on restricted titles." },
  { group: "Playback defaults", key: "autoplayNext", label: "Autoplay next", copy: "Offer the next title when a movie ends.", effect: "Applies unless a customer turns it off in Profile." },
  { group: "Playback defaults", key: "autoplayPreview", label: "Autoplay previews", copy: "Rotate the homepage hero automatically.", effect: "Applies unless a customer turns it off in Profile." },
  { group: "Notifications", key: "notifyNew", label: "New content alerts", copy: "Send a notification when titles are added.", effect: "Publishing a title adds an alert to every customer's bell." },
  { group: "Notifications", key: "notifyBilling", label: "Billing notifications", copy: "Send renewal and payment status updates.", effect: "Plan changes add a Subscription notification for the customer." },
];
const groups = ["Platform", "Catalog", "Safety", "Playback defaults", "Notifications"];

function SettingsPage() {
  const demoSettings = useSettings();
  const server = useServerSettings();
  const save = useSaveSettings();
  const isLoading = !DEMO_MODE && server.isLoading;
  const isError = !DEMO_MODE && server.isError;

  const s: Settings = DEMO_MODE ? demoSettings : (server.data ?? demoSettings);

  /** Saves for real (server, MySQL) and only then confirms; a failed save says so and the switch goes back. */
  const set = async (patch: Partial<Settings>, okMessage: string) => {
    if (DEMO_MODE) {
      update((st) => ({ settings: { ...st.settings, ...patch } }));
      toast.success(okMessage);
      return;
    }
    try {
      await save(patch);
      toast.success(okMessage);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "The setting could not be saved. Please try again.");
    }
  };

  if (isLoading) return <div className="space-y-3 p-6"><Skel className="h-8 w-64" /><Skel className="h-48 w-full" /><Skel className="h-48 w-full" /></div>;
  if (isError)
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground" role="alert">
        <p>The settings could not be loaded.</p>
        <Btn className="mt-3" onClick={() => void server.refetch()}>
          Try again
        </Btn>
      </div>
    );
  return (
    <>
      <PageHeader title="Settings" sub={DEMO_MODE ? "The switches that keep StreamVerse running the way you intend. Changes save instantly in this browser." : "The switches that keep StreamVerse running the way you intend. Every change is saved to the server and stays after a refresh or restart."} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {groups.map((g) => (
            <Panel key={g}>
              <PanelHeader title={g} />
              {rows
                .filter((r) => r.group === g)
                .map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {r.label}
                        {DEMO_MODE && r.backend && <BackendBadge />}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.copy}</div>
                      {r.effect && <div className="mt-0.5 text-[11px] text-soft">{r.effect}</div>}
                    </div>
                    <Toggle
                      checked={s[r.key]}
                      label={r.label}
                      onChange={(v) => {
                        void set({ [r.key]: v } as Partial<Settings>, `${r.label} ${v ? "on" : "off"}`);
                      }}
                    />
                  </div>
                ))}
              {g === "Platform" && (
                <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
                  <div>
                    <div className="text-sm font-semibold">Default language</div>
                    <div className="text-xs text-muted-foreground">Pre-selected as the Primary Language when adding content.</div>
                  </div>
                  <div className="w-full sm:w-44">
                    <SelectInput
                      aria-label="Default language"
                      options={LANGUAGES}
                      value={s.defaultLanguage}
                      onChange={(e) => {
                        void set({ defaultLanguage: e.target.value }, `Default language: ${e.target.value}`);
                      }}
                    />
                  </div>
                </div>
              )}
            </Panel>
          ))}
        </div>
        <Panel className="h-fit p-5">
          <span className="grid size-10 place-items-center rounded-md bg-primary/12 text-primary-text">
            <ShieldCheck className="size-5" />
          </span>
          <h2 className="mt-3 font-bold">Administrator account</h2>
          <p className="mt-1 text-sm text-muted-foreground">You're signed in as the StreamVerse administrator{DEMO_MODE ? " (demo)" : ""}.</p>
          {[
            ["Name", adminUser.name],
            ["Account type", adminUser.role],
            ["Workspace", "StreamVerse"],
          ].map(([k, v]) => (
            <div key={k} className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">{k}</span>
              <b>{v}</b>
            </div>
          ))}
          <Btn className="mt-4 w-full" onClick={() => showBackendNotice("Account settings", "Changing the admin's email and password is handled by the server.")}>
            Account settings
          </Btn>
          <Link to="/" className="mt-2 block text-center text-xs font-semibold text-muted-foreground hover:text-foreground">
            View the customer site
          </Link>
        </Panel>
      </div>
    </>
  );
}
