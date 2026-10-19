import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AVATARS, Avatar } from "@/components/sv/TopNavbar";
import { Btn, ConfirmDialog, Field, Panel, PanelHeader, SelectInput, TextInput, Toggle } from "@/components/sv/ui";
import { COUNTRIES, LANGUAGES } from "@/components/sv/wizard/kit";
import { useUpdateProfileMutation } from "@/hooks/useApiMe";
import { DEMO_MODE } from "@/lib/demo";
import { resetDrafts } from "@/lib/drafts";
import { resetStore } from "@/lib/store";
import { resetUser, setRole, updateUser, useUser, useUserHydrated, type UserState } from "@/lib/user";

export const Route = createFileRoute("/_site/profile")({
  head: () => ({ meta: [{ title: "Profile — StreamVerse" }, { name: "description", content: "Your account details and playback preferences." }] }),
  component: ProfilePage,
});

/** The form starts from saved data, so wait until it has loaded from the browser. */
function ProfilePage() {
  const hydrated = useUserHydrated();
  return hydrated ? <ProfileForm /> : <div className="mx-auto max-w-[1000px] px-4 pt-8 md:px-8" aria-busy="true" />;
}

const QUALITIES = ["Auto", "4K", "1080p", "720p", "480p"];
const SPEEDS = ["0.75", "1", "1.25", "1.5", "1.75", "2"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Form = Pick<UserState, "profile" | "prefs">;
const same = (a: Form, b: Form) => JSON.stringify(a) === JSON.stringify(b);

function ProfileForm() {
  const profile = useUser((s) => s.profile);
  const prefs = useUser((s) => s.prefs);
  const role = useUser((s) => s.role);
  const [form, setForm] = useState<Form>({ profile, prefs });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resetOpen, setResetOpen] = useState(false);
  const saved: Form = { profile, prefs };
  const dirty = !same(form, saved);
  const updateProfileMutation = useUpdateProfileMutation();

  const setP = <K extends keyof Form["profile"]>(k: K, v: Form["profile"][K]) => setForm((f) => ({ ...f, profile: { ...f.profile, [k]: v } }));
  const setPref = <K extends keyof Form["prefs"]>(k: K, v: Form["prefs"][K]) => setForm((f) => ({ ...f, prefs: { ...f.prefs, [k]: v } }));
  const setNote = (k: keyof Form["prefs"]["notifications"], v: boolean) => setForm((f) => ({ ...f, prefs: { ...f.prefs, notifications: { ...f.prefs.notifications, [k]: v } } }));

  const save = () => {
    const e: Record<string, string> = {};
    if (!form.profile.name.trim()) e["name"] = "Enter your full name.";
    if (!EMAIL.test(form.profile.email.trim())) e["email"] = "Enter a valid email address.";
    if (!(form.profile.age >= 5 && form.profile.age <= 120)) e["age"] = "Enter an age between 5 and 120.";
    setErrors(e);
    if (Object.keys(e).length) {
      toast.warning("Please fix the highlighted fields.");
      return;
    }
    updateUser((s) => ({ ...s, profile: { ...form.profile, name: form.profile.name.trim(), email: form.profile.email.trim() }, prefs: form.prefs }));
    toast.success("Profile saved");
    if (!DEMO_MODE) {
      updateProfileMutation.mutate(
        {
          fullName: form.profile.name.trim(),
          country: form.profile.country ?? null,
          preferredLanguage: form.profile.language ?? null,
          subtitleLanguage: form.prefs.subtitleLanguage ?? null,
          audioLanguage: form.prefs.audioLanguage ?? null,
          videoQuality: form.prefs.quality ?? null,
          audiobookSpeed: form.prefs.audiobookSpeed ?? null,
        },
        { onError: () => toast.error("Failed to sync profile with server") },
      );
    }
  };

  const err = (k: string) => errors[k] && <p role="alert" className="mt-1 text-[11px] font-medium text-primary-text">{errors[k]}</p>;

  return (
    <div className="mx-auto max-w-[1000px] px-4 pt-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your details and how StreamVerse plays for you.</p>
        </div>
        <div className="flex items-center gap-3">
          <span role="status" className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <Btn variant="primary" onClick={save} disabled={!dirty}>
            <Check /> Save Changes
          </Btn>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <Panel>
          <PanelHeader title="Profile information" />
          <div className="grid gap-6 p-5 md:grid-cols-[auto_1fr]">
            <div>
              <div className="eyebrow mb-2 text-soft">Avatar</div>
              <Avatar name={form.profile.name} index={form.profile.avatar} className="size-20 text-2xl" />
              <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Avatar colour">
                {AVATARS.map((_, i) => (
                  <button key={i} type="button" role="radio" aria-checked={form.profile.avatar === i} aria-label={`Avatar colour ${i + 1}`} onClick={() => setP("avatar", i)} className={`size-7 rounded-md ring-offset-2 ring-offset-surface ${AVATARS[i]} ${form.profile.avatar === i ? "ring-2 ring-foreground" : ""}`} />
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Field label="Full name" required>
                  <TextInput value={form.profile.name} onChange={(e) => setP("name", e.target.value)} aria-invalid={!!errors["name"]} />
                </Field>
                {err("name")}
              </div>
              <div>
                <Field label="Email" required>
                  <TextInput type="email" value={form.profile.email} onChange={(e) => setP("email", e.target.value)} aria-invalid={!!errors["email"]} />
                </Field>
                {err("email")}
              </div>
              <Field label="Language">
                <SelectInput options={LANGUAGES} value={form.profile.language} onChange={(e) => setP("language", e.target.value)} />
              </Field>
              <Field label="Country" hint="Used to show content available in your region.">
                <SelectInput options={COUNTRIES} value={form.profile.country} onChange={(e) => setP("country", e.target.value)} />
              </Field>
              <div>
                <Field label="Age" hint="Used for age-restricted titles.">
                  <TextInput type="number" min={5} max={120} value={form.profile.age} onChange={(e) => setP("age", Number(e.target.value))} aria-invalid={!!errors["age"]} />
                </Field>
                {err("age")}
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Preferences" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Preferred language">
              <SelectInput options={LANGUAGES} value={form.prefs.preferredLanguage} onChange={(e) => setPref("preferredLanguage", e.target.value)} />
            </Field>
            <Field label="Subtitle language">
              <SelectInput options={LANGUAGES} value={form.prefs.subtitleLanguage} onChange={(e) => setPref("subtitleLanguage", e.target.value)} />
            </Field>
            <Toggle checked={form.prefs.autoplayNext} onChange={(v) => setPref("autoplayNext", v)} label="Autoplay next" />
            <Toggle checked={form.prefs.autoplayPreview} onChange={(v) => setPref("autoplayPreview", v)} label="Autoplay previews" />
          </div>
          <div className="border-t border-border p-5">
            <div className="eyebrow mb-3 text-soft">Notification preferences</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={form.prefs.notifications.newRelease} onChange={(v) => setNote("newRelease", v)} label="New releases" />
              <Toggle checked={form.prefs.notifications.subscription} onChange={(v) => setNote("subscription", v)} label="Subscription and billing" />
              <Toggle checked={form.prefs.notifications.recommendation} onChange={(v) => setNote("recommendation", v)} label="Recommendations" />
              <Toggle checked={form.prefs.notifications.account} onChange={(v) => setNote("account", v)} label="Account messages" />
              <Toggle checked={form.prefs.notifications.email} onChange={(v) => setNote("email", v)} label="Also email me" />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Playback preferences" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Video quality">
              <SelectInput options={QUALITIES} value={form.prefs.quality} onChange={(e) => setPref("quality", e.target.value)} />
            </Field>
            <Field label="Subtitle default">
              <SelectInput options={["Off", ...LANGUAGES]} value={form.prefs.subtitleDefault} onChange={(e) => setPref("subtitleDefault", e.target.value)} />
            </Field>
            <Field label="Audio language">
              <SelectInput options={LANGUAGES} value={form.prefs.audioLanguage} onChange={(e) => setPref("audioLanguage", e.target.value)} />
            </Field>
            <Field label="Audiobook speed">
              <SelectInput options={SPEEDS} value={String(form.prefs.audiobookSpeed)} onChange={(e) => setPref("audiobookSpeed", Number(e.target.value))} />
            </Field>
          </div>
        </Panel>

        <div className="flex flex-wrap justify-end gap-2">
          <Btn onClick={() => { setForm(saved); setErrors({}); }} disabled={!dirty}>
            <RotateCcw /> Discard changes
          </Btn>
          <Btn variant="primary" onClick={save} disabled={!dirty}>
            <Check /> Save Changes
          </Btn>
        </div>

        {DEMO_MODE && (
          <Panel>
            <PanelHeader title="Demo tools" sub="For reviewing the frontend. These disappear once real accounts exist." />
            <div className="flex flex-wrap items-center gap-3 p-5">
              <Btn onClick={() => { setRole(role === "admin" ? "user" : "admin"); toast(role === "admin" ? "Now viewing as a customer" : "Now viewing as an admin"); }}>
                Switch to {role === "admin" ? "customer" : "admin"} view
              </Btn>
              <Btn variant="danger" onClick={() => setResetOpen(true)}>
                Reset demo data
              </Btn>
              <Link to="/states" className="inline-flex h-10 items-center rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3">
                Preview error screens
              </Link>
              <span className="text-xs text-muted-foreground">Current role: <b className="text-foreground uppercase">{role}</b></span>
            </div>
          </Panel>
        )}
      </div>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all demo data?"
        description="This clears everything saved in this browser (catalog changes, drafts, My List, progress) and restores the sample content."
        confirmLabel="Reset"
        onConfirm={() => {
          resetStore();
          resetUser();
          resetDrafts();
          toast.success("Demo data reset");
        }}
      />
    </div>
  );
}
