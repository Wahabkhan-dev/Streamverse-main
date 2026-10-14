import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Btn, inputCls } from "../ui";
import { Advanced, COUNTRIES, FieldBox, MultiSelect, Row, Section, SelectBox2, Switch, SystemField, TagInput, TextBox } from "./kit";
import type { Promo, Status } from "@/lib/data";

/** "unset" = nothing chosen yet (Settings: auto-publish off). "draft" is only ever set by the Save as Draft button. */
export type PublishMode = "now" | "schedule" | "draft" | "archive" | "unset";
export type TerritoryMode = "worldwide" | "selected" | "exclude";
export type Access = "Public" | "Subscribers Only" | "Hidden";

export const uniqueSlug = (desired: string, taken: string[], own?: string) => {
  const root = desired || "untitled";
  let slug = root;
  for (let n = 2; taken.includes(slug) && slug !== own; n++) slug = `${root}-${n}`;
  return slug;
};

/** Hidden titles stay Published but are kept out of customer lists by their access setting. */
export function statusFor(mode: PublishMode, availableFrom: string): Status {
  if (mode === "draft" || mode === "unset") return "Draft";
  if (mode === "archive") return "Archived";
  if (mode === "schedule") return "Scheduled";
  if (availableFrom && new Date(availableFrom) > new Date()) return "Scheduled";
  return "Published";
}

/** Local date + time -> "2026-10-09T18:00" (what the item stores), or undefined while either is missing. */
export const scheduledAt = (date: string, time: string) => (date && time ? `${date}T${time}` : undefined);
export const formatSchedule = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });

/** Drops undefined values so optional fields are left off instead of set to undefined. */
export function pruned<T>(o: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function TerritoryPicker({ mode, countries, onMode, onCountries }: { mode: TerritoryMode; countries: string[]; onMode: (m: TerritoryMode) => void; onCountries: (c: string[]) => void }) {
  const opts: [TerritoryMode, string][] = [
    ["worldwide", "Worldwide"],
    ["selected", "Selected countries"],
    ["exclude", "Exclude countries"],
  ];
  return (
    <div className="space-y-3">
      <FieldBox id="territory" label="Availability">
        <div className="flex flex-wrap gap-2">
          {opts.map(([v, l]) => (
            <label key={v} className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", mode === v ? "border-primary bg-primary/10" : "border-border bg-surface-2")}>
              <input type="radio" name="territory" className="accent-[var(--primary)]" checked={mode === v} onChange={() => onMode(v)} />
              {l}
            </label>
          ))}
        </div>
      </FieldBox>
      {mode !== "worldwide" && <MultiSelect id="countries" label={mode === "selected" ? "Available in" : "Not available in"} values={countries} onChange={onCountries} options={COUNTRIES} placeholder="Search countries…" />}
    </div>
  );
}

export const MIN_AGES = ["7", "13", "16", "17", "18"];
export const BOOK_AGE_RATINGS = ["All Ages", "7+", "13+", "16+", "18+"];

/** Minimum age: a short list of common ages, or a custom number. */
function MinAgeField({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string | undefined }) {
  const [custom, setCustom] = useState(!!value && !MIN_AGES.includes(value));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectBox2
        id="minAge"
        label="Minimum Age"
        required
        value={custom ? "Custom" : value}
        onChange={(v) => {
          if (v === "Custom") setCustom(true);
          else {
            setCustom(false);
            onChange(v);
          }
        }}
        options={[...MIN_AGES, "Custom"]}
        hint={hint}
      />
      {custom && <TextBox id="minAgeCustom" label="Custom minimum age" type="number" required value={value} onChange={onChange} />}
    </div>
  );
}

/**
 * One age model for every content type: the rating describes the title, and "Restrict access by minimum age"
 * is the only thing that makes customers confirm their age. The rating can suggest an age, but never sets it.
 */
export function AgeRestrictionControl({ restricted, minAge, onRestricted, onMinAge, suggestion, ratingLabel }: { restricted: boolean; minAge: string; onRestricted: (v: boolean) => void; onMinAge: (v: string) => void; suggestion?: string | undefined; ratingLabel?: string | undefined }) {
  return (
    <div className="space-y-3">
      <FieldBox id="ageRestricted" label="Age restriction">
        <div className="flex h-10 items-center">
          <Switch checked={restricted} onChange={onRestricted} label="Restrict access by minimum age" />
        </div>
      </FieldBox>
      {restricted && <MinAgeField value={minAge} onChange={onMinAge} hint="Customers confirm they are at least this age before opening the title." />}
      {restricted && suggestion && minAge !== suggestion && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Suggested for {ratingLabel}: <b className="text-foreground">{suggestion}</b>
          <button type="button" className="font-semibold text-primary-text hover:underline" onClick={() => onMinAge(suggestion)}>
            Use {suggestion}
          </button>
        </p>
      )}
    </div>
  );
}

/** Territory and dates share one collapsed group: most titles are available worldwide with no end date. */
export function AvailabilityGroup<T extends { territory: TerritoryMode; countries: string[]; availableFrom: string; availableUntil: string }>({ d, set }: { d: T; set: (fn: (d: T) => T) => void }) {
  return (
    <Advanced title="Territory & availability" desc="Optional. Available worldwide with no start or end date unless you set one." defaultOpen={d.territory !== "worldwide" || !!d.availableFrom || !!d.availableUntil}>
      <TerritoryPicker mode={d.territory} countries={d.countries} onMode={(territory) => set((x) => ({ ...x, territory }))} onCountries={(countries) => set((x) => ({ ...x, countries }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextBox id="availableFrom" label="Available From" type="date" optional value={d.availableFrom} onChange={(v) => set((x) => ({ ...x, availableFrom: v }))} />
        <TextBox id="availableUntil" label="Available Until" type="date" optional value={d.availableUntil} onChange={(v) => set((x) => ({ ...x, availableUntil: v }))} />
      </div>
    </Advanced>
  );
}

/** Who can see the title. New content starts as Subscribers Only. */
export function VisibilityPicker({ access, onAccess }: { access: Access; onAccess: (a: Access) => void }) {
  return (
    <Section title="Visibility" desc="Who can see this title. Hidden titles stay out of every customer list.">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Visibility">
        {(["Public", "Subscribers Only", "Hidden"] as Access[]).map((a) => (
          <label key={a} className={cn("flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm font-semibold", access === a ? "border-primary bg-primary/10" : "border-border bg-surface-2")}>
            <input type="radio" name="access" className="accent-[var(--primary)]" checked={access === a} onChange={() => onAccess(a)} />
            {a}
          </label>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- rights, SEO and system information */

export interface RightsFields {
  copyrightOwner: string;
  copyrightYear: string;
  rightsNotes: string;
}
/** One rights section for every content type. Territory availability is chosen separately. */
export function RightsSection<T extends RightsFields>({ d, set }: { d: T; set: (fn: (d: T) => T) => void }) {
  return (
    <Advanced title="Rights & licensing" desc="Optional. Who owns this title and under what terms it is licensed." defaultOpen={!!(d.copyrightOwner || d.rightsNotes)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextBox id="copyrightOwner" label="Copyright Owner" optional value={d.copyrightOwner} onChange={(v) => set((x) => ({ ...x, copyrightOwner: v }))} />
        <TextBox id="copyrightYear" label="Copyright Year" type="number" optional value={d.copyrightYear} onChange={(v) => set((x) => ({ ...x, copyrightYear: v }))} hint="Pre-filled with the current year." />
      </div>
      <FieldBox id="rightsNotes" label="License / Rights Notes" optional>
        <textarea id="rightsNotes" aria-label="License / Rights Notes" rows={3} value={d.rightsNotes} onChange={(e) => set((x) => ({ ...x, rightsNotes: e.target.value }))} className={cn(inputCls, "h-auto py-2")} />
      </FieldBox>
    </Advanced>
  );
}

export interface SeoFields {
  title: string;
  slug: string;
  slugTouched: boolean;
  seoTitle: string;
  seoTitleEdited: boolean;
  seoDesc: string;
  seoDescEdited: boolean;
  seo: string[];
}
/** The SEO title and description follow the title and summary until the admin edits them. */
export const seoTitleOf = (d: Pick<SeoFields, "title" | "seoTitle" | "seoTitleEdited">) => (d.seoTitleEdited ? d.seoTitle : d.title);
export const seoDescOf = (d: Pick<SeoFields, "seoDesc" | "seoDescEdited">, summary: string) => (d.seoDescEdited ? d.seoDesc : summary);

const slugOfText = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function SeoSection<T extends SeoFields>({ d, set, summary, path }: { d: T; set: (fn: (d: T) => T) => void; summary: string; path: string }) {
  return (
    <Advanced title="SEO" desc="Search-engine details. Filled in from the title and summary; change them only if needed.">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextBox id="seoTitle" label="SEO Title" optional value={seoTitleOf(d)} onChange={(v) => set((x) => ({ ...x, seoTitle: v, seoTitleEdited: true }))} hint="Follows the title." />
        <TextBox id="slug" label="Slug" optional value={d.slug} onChange={(v) => set((x) => ({ ...x, slug: slugOfText(v), slugTouched: true }))} hint={`streamverse.tv/${path}/${d.slug || "your-title"} · auto-generated, editable`} />
      </div>
      <FieldBox id="seoDesc" label="SEO Description" optional hint="Follows the short summary.">
        <textarea id="seoDesc" aria-label="SEO Description" rows={2} value={seoDescOf(d, summary)} onChange={(e) => set((x) => ({ ...x, seoDesc: e.target.value, seoDescEdited: true }))} className={cn(inputCls, "h-auto py-2")} />
      </FieldBox>
      <TagInput id="seo" label="SEO Keywords" optional values={d.seo} onChange={(v) => set((x) => ({ ...x, seo: v }))} noun="keywords" placeholder="Keywords for search engines" />
    </Advanced>
  );
}

export const fmtDay = (iso: string | number | Date) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Values the system already knows, shown at the top of the first step. Nothing here is typed by the admin. */
export function SystemPanel({ contentId, created, updated, status }: { contentId: string; created: string; updated: string; status: string }) {
  return (
    <Section title="System information" desc="Created automatically. You do not need to fill these in.">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <SystemField label="Internal Content ID" value={contentId} />
        <SystemField label="Created" value={created} />
        <SystemField label="Updated" value={updated} />
        <SystemField label="Status" value={status} note="System-controlled" />
      </div>
    </Section>
  );
}

/** Review step: what the system generated, kept separate from what the admin typed. */
export function SystemSummary({ contentId, created, slug, status }: { contentId: string; created: string; slug: string; status: string }) {
  return (
    <Section title="System generated" desc="Created for you. Review only if something looks wrong.">
      <div className="grid gap-x-8 sm:grid-cols-2">
        <Row k="Content ID" v={contentId} />
        <Row k="Created" v={created} />
        <Row k="Slug" v={slug} />
        <Row k="Status" v={status} />
      </div>
    </Section>
  );
}

export function ReviewGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="eyebrow text-[11px] text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** Suggested minimum age for common ratings. Only a suggestion; the admin can override it. */
export const suggestedMinAge = (rating: string): string => ({ G: "", PG: "", "PG-13": "13", R: "17", "NC-17": "18", "TV-Y": "", "TV-Y7": "7", "TV-G": "", "TV-PG": "", "TV-14": "14", "TV-MA": "17" } as Record<string, string>)[rating] ?? "";

const modes: { value: PublishMode; title: string; desc: string }[] = [
  { value: "now", title: "Publish now", desc: "Visible to customers immediately" },
  { value: "schedule", title: "Schedule publishing", desc: "Mark it Scheduled for a date and time" },
];
const archiveMode = { value: "archive" as PublishMode, title: "Archive", desc: "Keep it, but hide it everywhere" };

export function PromotionPanel({ promo, onChange }: { promo: Promo; onChange: (p: Promo) => void }) {
  const rows: [keyof Promo, string, string][] = [
    ["featured", "Featured", "Pinned first in Featured rows and the hero."],
    ["trending", "Trending", "Shown first in Trending."],
    ["popular", "Popular", "Shown first in Popular."],
    ["newRelease", "New Release", "Shown first in Latest / New rows."],
  ];
  return (
    <Section title="Promotion" desc="Choose where this title is promoted on the customer homepage.">
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([k, label, hint]) => (
          <div key={k} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-xs text-muted-foreground">{hint}</div>
            </div>
            <Switch checked={!!promo[k]} onChange={(v) => onChange({ ...promo, [k]: v })} label={label} />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function PublishPanel({ mode, onMode, publishDate, publishTime, onDate, onTime, ready, onGo, noun, existing }: { existing?: boolean | undefined; mode: PublishMode; onMode: (m: PublishMode) => void; publishDate: string; publishTime: string; onDate: (d: string) => void; onTime: (t: string) => void; ready: boolean; onGo: () => void; noun: string }) {
  const chosen = mode === "now" || mode === "schedule" || mode === "archive";
  const needsReady = mode === "now" || mode === "schedule";
  const options = existing ? [...modes, archiveMode] : modes;
  const at = scheduledAt(publishDate, publishTime);
  const inPast = !!at && new Date(at).getTime() <= Date.now();
  const scheduleOk = mode !== "schedule" || (!!at && !inPast);
  const label = mode === "now" ? `Publish ${noun}` : mode === "schedule" ? "Schedule publishing" : mode === "archive" ? "Archive" : "Choose how to publish";
  return (
    <Section title="Publishing options" desc="Choose how this title goes out.">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Publishing options">
        {options.map((m) => (
          <label key={m.value} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3", mode === m.value ? "border-primary bg-primary/10" : "border-border bg-surface-2 hover:border-foreground/25")}>
            <input type="radio" name="publish-mode" className="mt-1 accent-[var(--primary)]" checked={mode === m.value} onChange={() => onMode(m.value)} />
            <span>
              <span className="block text-sm font-semibold">{m.title}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </span>
          </label>
        ))}
      </div>
      {mode === "now" && (
        <p className="text-sm">
          <span className="text-muted-foreground">Publish Date:</span> <b>{fmtDay(Date.now())}</b> <span className="text-xs text-muted-foreground">(today, set automatically)</span>
        </p>
      )}
      {mode === "schedule" && (
        <div className="space-y-3">
          <div className="grid max-w-md gap-4 sm:grid-cols-2">
            <TextBox id="publishDate" label="Publish Date" type="date" required value={publishDate} onChange={onDate} />
            <TextBox id="publishTime" label="Publish Time" type="time" required value={publishTime} onChange={onTime} />
          </div>
          {at && !inPast && (
            <p className="text-sm">
              <span className="text-muted-foreground">Scheduled for:</span> <b>{formatSchedule(at)}</b>
            </p>
          )}
          {inPast && <p className="text-xs font-medium text-primary-text">Pick a date and time in the future.</p>}
          <p className="text-xs text-muted-foreground">Frontend demo: a scheduled title is marked Scheduled, but nothing publishes it automatically until the backend is connected. The release date is not changed.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" variant="primary" disabled={!chosen || (needsReady && !ready) || !scheduleOk} onClick={onGo}>
          <Check /> {label}
        </Btn>
        {!chosen && <span className="text-xs text-muted-foreground">Pick Publish now or Schedule. Use Save as Draft above to keep it unpublished.</span>}
        {needsReady && !ready && <span className="text-xs font-medium text-primary-text">Complete the items marked in red above before publishing.</span>}
        {mode === "schedule" && ready && !at && <span className="text-xs font-medium text-primary-text">Choose a publish date and time.</span>}
      </div>
    </Section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

export const fmtRuntime = (v: string) => {
  const t = v.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m` : `${n}m`;
  }
  return t;
};

/** Restrictions shared by the eBook and audiobook flows. `readingAge` holds the Age Rating. */
export interface BookRestrictionFields extends RightsFields {
  readingAge: string;
  ageRestricted: boolean;
  minAge: string;
  warning: string;
  territory: TerritoryMode;
  countries: string[];
  availableFrom: string;
  availableUntil: string;
  access: Access;
}
const ratingAge = (r: string) => (/^\d+\+$/.test(r) ? r.replace("+", "") : "");
export function BookRestrictions<T extends BookRestrictionFields>({ d, set }: { d: T; set: (fn: (d: T) => T) => void }) {
  // an age rating saved by an older version stays selectable
  const ratings = d.readingAge && !BOOK_AGE_RATINGS.includes(d.readingAge) ? [...BOOK_AGE_RATINGS, d.readingAge] : BOOK_AGE_RATINGS;
  return (
    <>
      <VisibilityPicker access={d.access} onAccess={(access) => set((x) => ({ ...x, access }))} />
      <Section title="Age rating & restriction" desc="The rating describes the title. The restriction is what asks customers to confirm their age.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectBox2 id="readingAge" label="Age Rating" optional value={d.readingAge} onChange={(v) => set((x) => ({ ...x, readingAge: v }))} options={ratings} />
        </div>
        <AgeRestrictionControl
          restricted={d.ageRestricted}
          minAge={d.minAge}
          onRestricted={(v) => set((x) => ({ ...x, ageRestricted: v }))}
          onMinAge={(v) => set((x) => ({ ...x, minAge: v }))}
          suggestion={ratingAge(d.readingAge)}
          ratingLabel={d.readingAge}
        />
      </Section>
      <Advanced title="Content warnings" desc="Optional. Describe anything customers should know about. This does not restrict access." defaultOpen={!!d.warning}>
        <FieldBox id="warning" label="Content Warning" optional>
          <textarea id="warning" aria-label="Content Warning" rows={3} value={d.warning} onChange={(e) => set((x) => ({ ...x, warning: e.target.value }))} className={cn(inputCls, "h-auto py-2")} />
        </FieldBox>
      </Advanced>
      <AvailabilityGroup d={d} set={set} />
      <RightsSection d={d} set={set} />
    </>
  );
}
