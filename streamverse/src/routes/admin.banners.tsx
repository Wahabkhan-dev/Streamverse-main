import { createFileRoute } from "@tanstack/react-router";
import { Disc3, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Btn, ConfirmDialog, Field, PageHeader, Panel, PanelHeader, SelectInput, Skel, StatusBadge, Tag, TextArea, TextInput, Toggle } from "@/components/sv/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCatalog } from "@/lib/items";
import { PLACEHOLDER_IMAGE } from "@/lib/placeholder";
import { BANNER_TYPES, update, useBanners, useCollections, type Banner, type BannerType, type LinkKind } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/config";
import { useAdminBannersQuery, useAdminBannerMutation } from "@/hooks/useAdminApi";
import type { ApiBanner } from "@/api/types";

export const Route = createFileRoute("/admin/banners")({ component: Banners });

const TYPE_INFO: Record<BannerType, { blurb: string; where: string; recommended: string }> = {
  "Hero Banner": { blurb: "Full-width feature", where: "Top of the homepage carousel", recommended: "1920 × 800" },
  "Normal Banner": { blurb: "Standard placement", where: "Between homepage rows", recommended: "1280 × 720" },
  "Latest Release Banner": { blurb: "Newly published", where: "Spotlight card on the homepage", recommended: "1200 × 628" },
  "Promotional Banner": { blurb: "Campaign message", where: "Slim strip under the hero", recommended: "1920 × 400" },
};
const KINDS: { id: LinkKind; label: string }[] = [
  { id: "none", label: "No link" },
  { id: "movie", label: "Movie" },
  { id: "ebook", label: "eBook" },
  { id: "audiobook", label: "Audiobook" },
  { id: "collection", label: "Collection" },
  { id: "subscription", label: "Subscription page" },
];
const MAX_IMAGE = 1_500_000;

const blank = (placeholder: string): Banner => ({ id: "", type: "Hero Banner", title: "", description: "", buttonText: "Watch Now", linkKind: "none", linkSlug: "", image: placeholder, mobileImage: placeholder, priority: 1, start: "", end: "", active: true });

const readFile = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

function ImageField({ label, hint, value, aspect, onChange }: { label: string; hint: string; value: string; aspect: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = async (f?: File) => {
    if (!f) return;
    if (!/\.(jpe?g|png|webp)$/i.test(f.name)) return void toast.warning("Use a JPG, PNG or WebP image.");
    if (f.size > MAX_IMAGE) return void toast.warning("That image is over 1.5 MB, so it can't be saved here. Use a smaller file.");
    onChange(await readFile(f));
    toast.success(`${label} updated`);
  };
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-soft">{label}</span>
        <span className="text-muted-foreground">{hint}</span>
      </div>
      <div style={{ aspectRatio: aspect }} className="relative overflow-hidden rounded-md border border-border bg-surface-2">
        {value ? <img src={value} alt={`${label} preview`} className="absolute inset-0 size-full object-cover" /> : <div className="grid size-full place-items-center text-xs text-muted-foreground">No image</div>}
      </div>
      <input ref={input} type="file" accept=".jpg,.jpeg,.png,.webp" aria-label={`${label} file`} className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <Btn type="button" size="sm" className="mt-2" onClick={() => input.current?.click()}>
        <ImagePlus /> {value ? "Replace" : "Upload"}
      </Btn>
    </div>
  );
}

function apiBannerToBanner(b: ApiBanner): Banner {
  return {
    id: b.id,
    type: (b.type as BannerType) ?? "Hero Banner",
    title: b.title,
    description: b.description,
    buttonText: b.buttonText,
    linkKind: b.linkKind as LinkKind,
    linkId: b.linkId,
    linkSlug: b.linkSlug ?? "",
    image: b.image,
    mobileImage: b.mobileImage,
    priority: b.priority,
    start: b.start,
    end: b.end,
    active: b.active,
  };
}

function Banners() {
  const demoBanners = useBanners();
  const apiQuery = useAdminBannersQuery();
  const apiMutation = useAdminBannerMutation();
  const isLoading = !DEMO_MODE && apiQuery.isLoading;
  const isError = !DEMO_MODE && apiQuery.isError;

  const apiBanners: Banner[] = useMemo(() => (apiQuery.data?.data ?? []).map(apiBannerToBanner), [apiQuery.data]);
  const banners: Banner[] = DEMO_MODE ? demoBanners : apiBanners;

  const cat = useCatalog();
  const collections = useCollections();
  const setBanners = (fn: (o: Banner[]) => Banner[]) => {
    if (DEMO_MODE) {
      update((s) => ({ banners: fn(s.banners) }));
    }
    // In !DEMO_MODE individual mutations are called directly; setBanners is DEMO_MODE-only
  };
  const placeholder = PLACEHOLDER_IMAGE;
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState<Banner>(blank(placeholder));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [del, setDel] = useState<string | null>(null);

  const begin = (id: string, type?: BannerType) => {
    setErrors({});
    setEdit(id);
    setDraft(id ? banners.find((b) => b.id === id)! : { ...blank(placeholder), priority: banners.length + 1, ...(type ? { type, buttonText: type === "Promotional Banner" ? "Learn more" : "Watch Now" } : {}) });
  };
  const targets = (kind: LinkKind): { slug: string; label: string; id: string }[] =>
    kind === "movie"
      ? cat.movies.map((m) => ({ slug: m.slug, label: m.title, id: m.cid ?? m.slug }))
      : kind === "ebook"
        ? cat.ebooks.map((b) => ({ slug: b.slug, label: b.title, id: b.cid ?? b.slug }))
        : kind === "audiobook"
          ? cat.audiobooks.map((b) => ({ slug: b.slug, label: b.title, id: b.cid ?? b.slug }))
          : kind === "collection"
            ? collections.map((c) => ({ slug: c.slug, label: c.name, id: c.id }))
            : [];
  const needsTarget = !["none", "subscription"].includes(draft.linkKind);

  const setKind = (linkKind: LinkKind) => {
    const first = targets(linkKind)[0];
    const hit = linkKind === "movie" ? cat.movies.find((m) => m.slug === first?.slug) : undefined;
    setDraft((d) => {
      const { linkId: _drop, ...rest } = d;
      void _drop;
      return { ...rest, linkKind, linkSlug: first?.slug ?? "", ...(first && !["none", "subscription"].includes(linkKind) ? { linkId: first.id } : {}), ...(hit && d.image === placeholder ? { image: hit.image, mobileImage: hit.image } : {}) };
    });
  };
  const setTarget = (slug: string) => {
    const hit = draft.linkKind === "movie" ? cat.movies.find((m) => m.slug === slug) : undefined;
    const id = targets(draft.linkKind).find((t) => t.slug === slug)?.id;
    setDraft((d) => ({ ...d, linkSlug: slug, ...(id ? { linkId: id } : {}), ...(hit && (d.image === placeholder || cat.movies.some((m) => m.image === d.image)) ? { image: hit.image, mobileImage: hit.image } : {}) }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!draft.title.trim() && !(draft.useLinked && needsTarget && draft.linkSlug)) e["title"] = "Banner title is required.";
    if (draft.start && draft.end && draft.end < draft.start) e["end"] = "End date must be on or after the start date.";
    if (!(draft.priority >= 1)) e["priority"] = "Priority must be 1 or higher.";
    if (needsTarget && !draft.linkSlug) e["link"] = "Choose the content this banner links to.";
    setErrors(e);
    if (Object.keys(e).length) return void toast.warning("Please fix the highlighted fields.");
    const saved: Banner = { ...draft, title: draft.title.trim(), description: draft.description.trim(), id: draft.id || `b-${Date.now().toString(36)}` };
    if (DEMO_MODE) {
      setBanners((o) => (edit ? o.map((b) => (b.id === edit ? saved : b)) : [saved, ...o]));
      setEdit(null);
      toast.success("Banner saved");
    } else {
      const apiData = { type: saved.type, title: saved.title, description: saved.description, buttonText: saved.buttonText, linkKind: saved.linkKind, linkId: saved.linkId, linkSlug: saved.linkSlug, image: saved.image, mobileImage: saved.mobileImage, priority: saved.priority, start: saved.start, end: saved.end, active: saved.active };
      if (edit) {
        apiMutation.update.mutate({ id: edit, data: apiData }, { onSuccess: () => { setEdit(null); toast.success("Banner saved"); } });
      } else {
        apiMutation.create.mutate(apiData, { onSuccess: () => { setEdit(null); toast.success("Banner created"); } });
      }
    }
  };
  const err = (k: string) => errors[k] && <p role="alert" className="mt-1 text-[11px] font-medium text-primary-text">{errors[k]}</p>;
  const sorted = [...banners].sort((a, b) => a.priority - b.priority);

  if (isLoading) return <div className="space-y-4 p-6"><Skel className="h-8 w-64" /><Skel className="h-32 w-full" /><Skel className="h-64 w-full" /></div>;
  if (isError) return <div className="p-8 text-center text-sm text-muted-foreground">Failed to load banners.</div>;

  return (
    <>
      <PageHeader title="Banners" sub="Schedule the images and stories that lead the StreamVerse experience." actions={<Btn variant="primary" onClick={() => begin("")}><Plus /> Add banner</Btn>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BANNER_TYPES.map((t) => (
          <button key={t} onClick={() => begin("", t)} className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-foreground/25">
            <span className="grid size-9 place-items-center rounded-md bg-primary/12 text-primary-text">
              <Disc3 className="size-4" />
            </span>
            <div className="mt-3 text-sm font-bold">{t}</div>
            <div className="text-xs text-muted-foreground">{TYPE_INFO[t].blurb}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{TYPE_INFO[t].where}</div>
          </button>
        ))}
      </div>
      <Panel>
        <PanelHeader title="Placements" sub="Lowest priority number shows first" action={<span className="text-xs text-muted-foreground">{banners.length} banners</span>} />
        {sorted.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No banners yet. Use “Add banner” to create the first one.</div>}
        {sorted.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4 last:border-0">
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md">
              <img src={b.image} alt="" className="size-full object-cover" />
              <div className="absolute inset-0 bg-hero-x" />
              <span className="absolute bottom-1 left-1.5 text-[9px] font-bold tracking-wide text-soft uppercase">{b.type.split(" ")[0]}</span>
            </div>
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold">{b.title}</span>
                <Tag>{b.type}</Tag>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {b.linkKind === "none" ? "No link" : b.linkKind === "subscription" ? "Links to Subscription" : `Links to ${b.linkKind}: ${targets(b.linkKind).find((t) => t.slug === b.linkSlug)?.label ?? b.linkSlug}`} · {b.start || "No start"} to {b.end || "No end"} · Priority {b.priority}
              </div>
            </div>
            <StatusBadge status={b.active ? "Active" : "Draft"} />
            <button className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label={`Edit ${b.title}`} title="Edit" onClick={() => begin(b.id)}>
              <Pencil className="size-4" />
            </button>
            <button className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text" aria-label={`Delete ${b.title}`} title="Delete" onClick={() => setDel(b.id)}>
              <Trash2 className="size-4" />
            </button>
            <Toggle
              checked={b.active}
              onChange={(v) => {
                if (DEMO_MODE) {
                  setBanners((o) => o.map((x) => (x.id === b.id ? { ...x, active: v } : x)));
                } else {
                  apiMutation.update.mutate({ id: b.id, data: { active: v } }, { onSuccess: () => toast.success(`${b.title} ${v ? "activated" : "deactivated"}`) });
                }
              }}
              name={`Active — ${b.title}`}
            />
          </div>
        ))}
      </Panel>

      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-surface-2 sm:max-w-2xl">
          <DialogHeader>
            <div className="eyebrow text-[10px] text-primary-text">Placement settings</div>
            <DialogTitle>{edit ? "Edit banner" : "Add banner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Field label="Title" required>
                <TextInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-invalid={!!errors["title"]} />
              </Field>
              {err("title")}
            </div>
            <Field label="Description">
              <TextArea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Banner type" hint={`${TYPE_INFO[draft.type].where} · ${TYPE_INFO[draft.type].recommended}`}>
                <SelectInput options={BANNER_TYPES} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as BannerType })} />
              </Field>
              <Field label="Button text">
                <TextInput value={draft.buttonText} onChange={(e) => setDraft({ ...draft, buttonText: e.target.value })} />
              </Field>
              <Field label="Linked content">
                <select aria-label="Linked content type" value={draft.linkKind} onChange={(e) => setKind(e.target.value as LinkKind)} className="h-10 w-full appearance-none rounded-md border border-input bg-surface-2 px-3 text-sm focus:border-primary focus:outline-none">
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <Field label="Linked item">
                  <select aria-label="Linked item" disabled={!needsTarget} value={draft.linkSlug} onChange={(e) => setTarget(e.target.value)} className={cn("h-10 w-full appearance-none rounded-md border border-input bg-surface-2 px-3 text-sm focus:border-primary focus:outline-none disabled:opacity-50")}>
                    {!needsTarget && <option value="">-</option>}
                    {needsTarget && <option value="">Select…</option>}
                    {targets(draft.linkKind).map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {err("link")}
              </div>
              {needsTarget && draft.linkKind !== "collection" && (
                <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={!!draft.useLinked} onChange={(e) => setDraft({ ...draft, useLinked: e.target.checked })} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span>
                    Use linked content data
                    <span className="block text-[11px] text-muted-foreground">Blank title, description and image fall back to the linked title, so edits to it show up here. Anything you type overrides it.</span>
                  </span>
                </label>
              )}
              <Field label="Start date">
                <TextInput type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </Field>
              <div>
                <Field label="End date">
                  <TextInput type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} aria-invalid={!!errors["end"]} />
                </Field>
                {err("end")}
              </div>
              <div>
                <Field label="Priority" hint="1 shows first">
                  <TextInput type="number" min={1} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
                </Field>
                {err("priority")}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ImageField label="Desktop Image" hint="1920 × 800" aspect="12 / 5" value={draft.image} onChange={(image) => setDraft((d) => ({ ...d, image }))} />
              <ImageField label="Mobile Image" hint="750 × 1000" aspect="3 / 4" value={draft.mobileImage} onChange={(mobileImage) => setDraft((d) => ({ ...d, mobileImage }))} />
            </div>
            <Toggle checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label="Active" />
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setEdit(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={save}>
                Save banner
              </Btn>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={del !== null}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete this banner?"
        description="It will stop showing on the customer site immediately."
        onConfirm={() => {
          if (DEMO_MODE) {
            setBanners((o) => o.filter((b) => b.id !== del));
            toast.success("Banner deleted");
          } else if (del) {
            apiMutation.remove.mutate(del, { onSuccess: () => toast.success("Banner deleted") });
          }
        }}
      />
    </>
  );
}
