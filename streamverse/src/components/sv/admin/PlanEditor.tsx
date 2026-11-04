import { Check, TriangleAlert, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiPlan } from "@/api/types";
import { Btn, Field, SelectInput, TextArea, TextInput, Toggle } from "@/components/sv/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeChanges, describeOffer, money, QUALITY_OPTIONS, type PlanTerms, type QualityLabel } from "@/lib/planLimits";
import { cn } from "@/lib/utils";

export type PlanSaveData = Pick<ApiPlan, "name" | "priceAmount" | "billingInterval" | "features" | "active"> &
  Required<Pick<ApiPlan, "moviesEnabled" | "ebooksEnabled" | "audiobooksEnabled" | "maxVideoQuality" | "maxDevices" | "maxConcurrentStreams">> & { slug?: string; currency?: string; description?: string };

interface Draft {
  name: string;
  description: string;
  price: string;
  interval: "MONTHLY" | "YEARLY";
  features: string;
  active: boolean;
  movies: boolean;
  ebooks: boolean;
  audiobooks: boolean;
  quality: QualityLabel | null;
  devicesUnlimited: boolean;
  devices: string;
  streamsUnlimited: boolean;
  streams: string;
}

const slugOf = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function draftOf(p: ApiPlan | null): Draft {
  return {
    name: p?.name ?? "",
    description: p?.description ?? "",
    price: p ? String(p.priceAmount / 100) : "",
    interval: p?.billingInterval ?? "MONTHLY",
    features: p?.features.join(", ") ?? "",
    active: p?.active ?? true,
    movies: p?.moviesEnabled ?? true,
    ebooks: p?.ebooksEnabled ?? true,
    audiobooks: p?.audiobooksEnabled ?? true,
    quality: (p?.maxVideoQuality as QualityLabel | null | undefined) ?? null,
    devicesUnlimited: p ? (p.maxDevices ?? null) === null : false,
    devices: String(p?.maxDevices ?? 2),
    streamsUnlimited: p ? (p.maxConcurrentStreams ?? null) === null : false,
    streams: String(p?.maxConcurrentStreams ?? 1),
  };
}

const positive = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
};

function termsOf(d: Draft): PlanTerms {
  return {
    moviesEnabled: d.movies,
    ebooksEnabled: d.ebooks,
    audiobooksEnabled: d.audiobooks,
    maxVideoQuality: d.quality,
    maxDevices: d.devicesUnlimited ? null : positive(d.devices),
    maxConcurrentStreams: d.streamsUnlimited ? null : positive(d.streams),
    priceAmount: Math.round((Number(d.price) || 0) * 100),
    billingInterval: d.interval,
    active: d.active,
  };
}

const termsOfPlan = (p: ApiPlan): PlanTerms => ({
  moviesEnabled: p.moviesEnabled ?? true,
  ebooksEnabled: p.ebooksEnabled ?? false,
  audiobooksEnabled: p.audiobooksEnabled ?? false,
  maxVideoQuality: (p.maxVideoQuality as QualityLabel | null | undefined) ?? null,
  maxDevices: p.maxDevices ?? null,
  maxConcurrentStreams: p.maxConcurrentStreams ?? null,
  priceAmount: p.priceAmount,
  billingInterval: p.billingInterval,
  active: p.active,
});

function LimitRow({ label, hint, unlimited, onUnlimited, value, onValue, unit }: { label: string; hint: string; unlimited: boolean; onUnlimited: (v: boolean) => void; value: string; onValue: (v: string) => void; unit: string }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <TextInput type="number" min={1} max={100} className="w-24" aria-label={`${label}: how many`} disabled={unlimited} value={unlimited ? "" : value} onChange={(e) => onValue(e.target.value)} />
        <span className="text-sm text-muted-foreground">{unit}</span>
        <Toggle checked={unlimited} onChange={onUnlimited} label="Unlimited" />
      </div>
    </div>
  );
}

/**
 * Create or edit a plan (live mode). Everything a plan offers is set here, in one place, and shown back in plain words so the admin
 * sees what a customer on this plan will actually get. Editing a plan that people are already on lists, in plain words, what changes
 * for them, and asks the admin to confirm before it is saved.
 */
export function PlanEditor({ open, plan, onClose, onSave, saving }: { open: boolean; plan: ApiPlan | null; onClose: () => void; onSave: (data: PlanSaveData) => void; saving: boolean }) {
  const [d, setD] = useState<Draft>(() => draftOf(plan));
  const [confirmed, setConfirmed] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!open) return;
    setD(draftOf(plan));
    setConfirmed(false);
    setProblem("");
  }, [open, plan]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    setConfirmed(false);
  };
  const terms = termsOf(d);
  const lines = describeOffer(terms);
  const subscribers = plan?.subscriberCount ?? 0;
  const changes = useMemo(() => (plan ? describeChanges(termsOfPlan(plan), terms) : []), [plan, terms]);
  const needsConfirm = subscribers > 0 && changes.length > 0;

  function save() {
    const price = Number(d.price);
    if (!d.name.trim()) return setProblem("Give the plan a name.");
    if (!Number.isFinite(price) || price <= 0) return setProblem("Enter a price above 0.");
    if (!d.devicesUnlimited && positive(d.devices) === null) return setProblem("Devices must be a whole number from 1 to 100, or Unlimited.");
    if (!d.streamsUnlimited && positive(d.streams) === null) return setProblem("Streams must be a whole number from 1 to 100, or Unlimited.");
    if (!d.movies && !d.ebooks && !d.audiobooks) return setProblem("Turn on at least one kind of content, or customers would pay for nothing.");
    if (needsConfirm && !confirmed) return setProblem(`Please confirm you understand this changes things for the ${subscribers} customer${subscribers === 1 ? "" : "s"} on this plan.`);
    setProblem("");
    onSave({
      name: d.name.trim(),
      ...(plan ? {} : { slug: slugOf(d.name), currency: "usd" }),
      description: d.description.trim(),
      priceAmount: terms.priceAmount,
      billingInterval: d.interval,
      features: d.features.split(",").map((f) => f.trim()).filter(Boolean),
      active: d.active,
      moviesEnabled: d.movies,
      ebooksEnabled: d.ebooks,
      audiobooksEnabled: d.audiobooks,
      maxVideoQuality: d.quality,
      maxDevices: terms.maxDevices,
      maxConcurrentStreams: terms.maxConcurrentStreams,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] border-border bg-surface-2 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : "Create plan"}</DialogTitle>
          <DialogDescription>Set the price and exactly what customers on this plan get. The summary below shows it the way a customer will experience it.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan name" required>
              <TextInput value={d.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Price (USD)" required hint="Stripe is charged exactly this amount.">
              <TextInput type="number" min={0} step="0.01" value={d.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label="Billed">
              <SelectInput options={["Monthly", "Yearly"]} value={d.interval === "MONTHLY" ? "Monthly" : "Yearly"} onChange={(e) => set("interval", e.target.value === "Yearly" ? "YEARLY" : "MONTHLY")} />
            </Field>
            <Field label="Short description">
              <TextInput value={d.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>
          <Field label="Selling points" hint="Comma separated. Shown to customers when they choose a plan.">
            <TextArea rows={2} value={d.features} onChange={(e) => set("features", e.target.value)} />
          </Field>

          <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4">
            <legend className="px-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">What this plan includes</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <Toggle checked={d.movies} onChange={(v) => set("movies", v)} label="Movies" />
              <Toggle checked={d.ebooks} onChange={(v) => set("ebooks", v)} label="eBooks" />
              <Toggle checked={d.audiobooks} onChange={(v) => set("audiobooks", v)} label="Audiobooks" />
            </div>
            <Field label="Highest video quality" hint="Customers can't watch above this. Their player only gets the qualities the plan allows.">
              <SelectInput
                options={QUALITY_OPTIONS.map((q) => q.label)}
                value={QUALITY_OPTIONS.find((q) => q.value === d.quality)?.label ?? QUALITY_OPTIONS[0]!.label}
                onChange={(e) => set("quality", QUALITY_OPTIONS.find((q) => q.label === e.target.value)?.value ?? null)}
              />
            </Field>
            <LimitRow label="Devices" hint="How many devices a customer can have signed in. A new device above this is refused." unit="devices" unlimited={d.devicesUnlimited} onUnlimited={(v) => set("devicesUnlimited", v)} value={d.devices} onValue={(v) => set("devices", v)} />
            <LimitRow label="Screens at the same time" hint="How many movies or audiobooks can play at once on one account. eBooks don't count." unit="at once" unlimited={d.streamsUnlimited} onUnlimited={(v) => set("streamsUnlimited", v)} value={d.streams} onValue={(v) => set("streams", v)} />
          </fieldset>

          <section aria-label="What customers on this plan get" className="rounded-lg border border-success/30 bg-success/5 p-4">
            <div className="text-xs font-bold tracking-wider text-success uppercase">What customers on this plan get</div>
            <p className="mt-1 text-sm font-semibold">
              {d.name.trim() || "This plan"} · {money(terms.priceAmount)} per {d.interval === "YEARLY" ? "year" : "month"}
            </p>
            <ul className="mt-2 space-y-1.5">
              {lines.map((l) => (
                <li key={l.text} className={cn("flex items-start gap-2 text-sm", l.ok ? "text-soft" : "text-warning")}>
                  {l.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          </section>

          {plan && subscribers > 0 && (
            <section aria-label="Who this change affects" className={cn("rounded-lg border p-4", changes.length ? "border-warning/40 bg-warning/5" : "border-border bg-surface")}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4" aria-hidden /> {subscribers.toLocaleString()} customer{subscribers === 1 ? " is" : "s are"} on this plan
              </div>
              {changes.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Nothing you've changed affects what they get.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-soft">If you save, this is what changes for them:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-soft">
                    {changes.map((c) => (
                      <li key={c.text}>{c.text}</li>
                    ))}
                  </ul>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-0.5 accent-[var(--primary)]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    <span>I understand this changes things for the {subscribers.toLocaleString()} customer{subscribers === 1 ? "" : "s"} on this plan.</span>
                  </label>
                </>
              )}
            </section>
          )}

          <Toggle checked={d.active} onChange={(v) => set("active", v)} label="Plan is on sale (new customers can choose it)" />
          {problem && (
            <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Btn onClick={onClose} disabled={saving}>
              Cancel
            </Btn>
            <Btn variant="primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : plan ? "Save changes" : "Create plan"}
            </Btn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
