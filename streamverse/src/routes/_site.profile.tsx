import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ImagePlus, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { avatarFileProblem, photoToAvatar } from "@/lib/avatarImage";
import { toast } from "sonner";
import { Avatar } from "@/components/sv/TopNavbar";
import { ACCENTS, accentGradient } from "@/lib/accent";
import { Btn, ConfirmDialog, Field, Panel, PanelHeader, SelectInput, TextInput, Toggle } from "@/components/sv/ui";
import { COUNTRIES, LANGUAGES } from "@/components/sv/wizard/kit";
import { countryCode } from "@/components/sv/wizard/live";
import { useAgeVerificationQuery, useUpdateProfileMutation, useVerifyAgeMutation } from "@/hooks/useApiMe";
import { isApiError } from "@/api/client";
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
  /** The colour applies and is kept at once (it only changes how the app looks), so it never waits for Save Changes. */
  const pickColour = (i: number) => {
    setP("avatar", i);
    updateUser((s) => ({ ...s, profile: { ...s.profile, avatar: i } }));
  };
  /** A photo is shrunk to a small square and kept on this device at once, like the colour. */
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const keepPhoto = (avatarImage: string | undefined) => {
    setP("avatarImage", avatarImage);
    updateUser((s) => ({ ...s, profile: { ...s.profile, avatarImage } }));
  };
  const uploadPhoto = async (f?: File) => {
    if (!f) return;
    const problem = avatarFileProblem(f);
    if (problem) return void toast.warning(problem);
    setPhotoBusy(true);
    try {
      keepPhoto(await photoToAvatar(f));
      toast.success("Profile photo updated");
    } catch {
      toast.error("We couldn't read that photo. Try a different one.");
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = () => {
    keepPhoto(undefined);
    toast.success("Profile photo removed");
  };
  const setNote = (k: keyof Form["prefs"]["notifications"], v: boolean) => setForm((f) => ({ ...f, prefs: { ...f.prefs, notifications: { ...f.prefs.notifications, [k]: v } } }));

  const save = () => {
    const e: Record<string, string> = {};
    if (!form.profile.name.trim()) e["name"] = "Enter your full name.";
    if (!EMAIL.test(form.profile.email.trim())) e["email"] = "Enter a valid email address.";
    if (DEMO_MODE && !(form.profile.age >= 5 && form.profile.age <= 120)) e["age"] = "Enter an age between 5 and 120.";
    setErrors(e);
    if (Object.keys(e).length) {
      toast.warning("Please fix the highlighted fields.");
      return;
    }
    const keep = () => updateUser((s) => ({ ...s, profile: { ...form.profile, name: form.profile.name.trim(), email: form.profile.email.trim() }, prefs: form.prefs }));
    if (DEMO_MODE) {
      keep();
      toast.success("Profile saved");
    } else {
      // live: "saved" only once the server has stored it
      updateProfileMutation.mutate(
        {
          fullName: form.profile.name.trim(),
          // the list shows names, the API stores ISO codes ("United States" -> "US"); no country chosen = null, never ""
          country: (form.profile.country && countryCode(form.profile.country)) || null,
          preferredLanguage: form.profile.language ?? null,
          subtitleLanguage: form.prefs.subtitleLanguage ?? null,
          audioLanguage: form.prefs.audioLanguage ?? null,
          videoQuality: form.prefs.quality ?? null,
          audiobookSpeed: form.prefs.audiobookSpeed ?? null,
        },
        {
          onSuccess: () => {
            keep();
            toast.success("Profile saved");
          },
          onError: () => toast.error("Your profile could not be saved. Please try again."),
        },
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
          <Btn variant="primary" onClick={save} disabled={!dirty || updateProfileMutation.isPending}>
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
              <Avatar name={form.profile.name} index={form.profile.avatar} image={form.profile.avatarImage} className="size-20 text-2xl" />
              <input ref={photoInput} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" aria-label="Profile photo file" className="hidden" onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="mt-3 flex max-w-[11rem] flex-wrap gap-1.5">
                <Btn type="button" size="sm" onClick={() => photoInput.current?.click()} disabled={photoBusy}>
                  <ImagePlus /> {form.profile.avatarImage ? "Change photo" : "Upload photo"}
                </Btn>
                {form.profile.avatarImage && (
                  <Btn type="button" size="sm" onClick={removePhoto}>
                    Remove
                  </Btn>
                )}
              </div>
              <div className="mt-3 flex max-w-[11rem] flex-wrap gap-1.5" role="radiogroup" aria-label="Avatar colour">
                {ACCENTS.map((a, i) => (
                  <button
                    key={a.name}
                    type="button"
                    role="radio"
                    aria-checked={form.profile.avatar === i}
                    aria-label={`Avatar colour ${i + 1}: ${a.name}`}
                    title={a.name}
                    onClick={() => pickColour(i)}
                    style={{ backgroundImage: accentGradient(i) }}
                    className={`size-7 rounded-md ring-offset-2 ring-offset-surface ${form.profile.avatar === i ? "ring-2 ring-foreground" : ""}`}
                  />
                ))}
              </div>
              <p className="mt-2 max-w-[11rem] text-[11px] text-muted-foreground">This colour is also used across StreamVerse on this device.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Field label="Full name" required>
                  <TextInput value={form.profile.name} onChange={(e) => setP("name", e.target.value)} aria-invalid={!!errors["name"]} />
                </Field>
                {err("name")}
              </div>
              <div>
                <Field label="Email" required {...(DEMO_MODE ? {} : { hint: "Your sign-in email can't be changed here." })}>
                  <TextInput type="email" value={form.profile.email} readOnly={!DEMO_MODE} onChange={(e) => setP("email", e.target.value)} aria-invalid={!!errors["email"]} />
                </Field>
                {err("email")}
              </div>
              <Field label="Country" hint="Used to show content available in your region.">
                <SelectInput options={COUNTRIES} value={form.profile.country} onChange={(e) => setP("country", e.target.value)} />
              </Field>
              {DEMO_MODE ? (
                <div>
                  <Field label="Age" hint="Used for age-restricted titles.">
                    <TextInput type="number" min={5} max={120} value={form.profile.age} onChange={(e) => setP("age", Number(e.target.value))} aria-invalid={!!errors["age"]} />
                  </Field>
                  {err("age")}
                </div>
              ) : (
                <AgeConfirm />
              )}
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Preferences" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Subtitle language">
              <SelectInput options={LANGUAGES} value={form.prefs.subtitleLanguage} onChange={(e) => setPref("subtitleLanguage", e.target.value)} />
            </Field>
            <Toggle checked={form.prefs.autoplayNext} onChange={(v) => setPref("autoplayNext", v)} label="Autoplay next" />
            <Toggle checked={form.prefs.autoplayPreview} onChange={(v) => setPref("autoplayPreview", v)} label="Autoplay previews" />
          </div>
          <div className="border-t border-border p-5">
            <div className="eyebrow mb-1 text-soft">Notification preferences</div>
            <p className="mb-3 text-xs text-muted-foreground">Choose which alerts appear in your notification bell on this device.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={form.prefs.notifications.newRelease} onChange={(v) => setNote("newRelease", v)} label="New releases" />
              <Toggle checked={form.prefs.notifications.subscription} onChange={(v) => setNote("subscription", v)} label="Subscription and billing" />
              <Toggle checked={form.prefs.notifications.account} onChange={(v) => setNote("account", v)} label="Account messages" />
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

/** Live mode: the customer confirms their age with their date of birth; the server stores it and decides age-restricted access from it. */
function AgeConfirm() {
  const status = useAgeVerificationQuery();
  const verify = useVerifyAgeMutation();
  const [dob, setDob] = useState("");
  const confirmed = status.data?.ageConfirmed === true;
  const submit = () => {
    if (!dob) return;
    verify.mutate(dob, {
      onSuccess: () => {
        setDob("");
        toast.success("Age confirmed");
      },
      onError: (err) => toast.error(isApiError(err) && err.status === 400 ? "Enter a real date of birth." : "Your age could not be confirmed. Please try again."),
    });
  };
  return (
    <div>
      <Field label="Date of birth" hint={confirmed ? "Age confirmed. Enter a date again only to correct it." : "Needed for age-restricted titles. It is never shown to anyone."}>
        <div className="flex gap-2">
          <TextInput type="date" aria-label="Date of birth" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} />
          <Btn onClick={submit} disabled={!dob || verify.isPending}>
            Confirm age
          </Btn>
        </div>
      </Field>
      <p data-testid="age-status" className="mt-1 text-[11px] text-muted-foreground">
        {status.isPending ? "Checking…" : confirmed ? "Age confirmed" : "Age not confirmed"}
      </p>
    </div>
  );
}
