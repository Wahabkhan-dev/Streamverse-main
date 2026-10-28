import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  GripVertical,
  ListPlus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { ContentPicker } from "@/components/sv/ContentPicker";
import {
  Btn,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  Skel,
  TextInput,
  Toggle,
} from "@/components/sv/ui";
import { DragHandle, useReorder } from "@/components/sv/wizard/kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HOME_DEFAULTS,
  update,
  useBanners,
  useHomepage,
  useMovies,
  type HomeAutoFlag,
  type HomeSection,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/config";
import { useAdminHomepageQuery, useAdminHomepageMutation } from "@/hooks/useAdminApi";
import type { ApiHomeSection } from "@/api/types";

export const Route = createFileRoute("/admin/homepage")({ component: Homepage });

const manualCapable = new Set(HOME_DEFAULTS.filter((d) => d.manual).map((d) => d.id));
const AUTO_FLAG_LABELS: Record<HomeAutoFlag, string> = {
  featured: "Featured",
  newRelease: "New Release",
  trending: "Trending",
  popular: "Popular",
};
const note: Partial<Record<HomeSection["id"], string>> = {
  continue: "Each customer's own in-progress movies",
  collections: "All published collections (managed in Collections)",
};
const heroNote = (s: HomeSection) =>
  s.mode === "manual"
    ? `${s.items.length} hand-picked ${s.items.length === 1 ? "movie" : "movies"}`
    : `Automatic: ${AUTO_FLAG_LABELS[s.autoFlag ?? "featured"]} movies`;

const SECTION_TYPE_TO_AUTO_FLAG: Partial<Record<ApiHomeSection["type"], HomeAutoFlag>> = {
  TRENDING: "trending",
  POPULAR: "popular",
  FEATURED: "featured",
  NEW_RELEASE: "newRelease",
  LATEST: "newRelease",
};

type EditableSection = HomeSection & {
  _dbId: string;
  _updatedAt: string | undefined;
  /** set for Banner / Collection sections, which have no item list to manage */ sourceNote?: string;
};

function apiSectionToEditable(s: ApiHomeSection): EditableSection {
  const mode: "auto" | "manual" = s.type === "MANUAL" ? "manual" : "auto";
  const autoFlag = SECTION_TYPE_TO_AUTO_FLAG[s.type];
  return {
    _dbId: s.id,
    _updatedAt: s.updatedAt,
    ...(s.type === "BANNER"
      ? { sourceNote: `Banner: ${s.banner?.title ?? "(banner removed)"}` }
      : s.type === "COLLECTION"
        ? { sourceNote: `Collection: ${s.collection?.name ?? "(collection removed)"}` }
        : {}),
    id: s.key as HomeSection["id"],
    title: s.displayTitle,
    enabled: s.enabled,
    limit: s.itemLimit,
    mode,
    ...(autoFlag !== undefined ? { autoFlag } : {}),
    items: (s.items ?? []).map((item) => ({
      type:
        item.contentType === "movie"
          ? "Movie"
          : item.contentType === "ebook"
            ? "eBook"
            : "Audiobook",
      slug: item.movie?.slug ?? item.ebook?.slug ?? item.audiobook?.slug ?? "",
      id: item.contentId,
    })),
  };
}

const SECTION_TYPE_OPTIONS: { label: string; value: ApiHomeSection["type"] }[] = [
  { label: "Manual (hand-picked)", value: "MANUAL" },
  { label: "Trending", value: "TRENDING" },
  { label: "Popular", value: "POPULAR" },
  { label: "New Release", value: "NEW_RELEASE" },
  { label: "Featured", value: "FEATURED" },
  { label: "Latest", value: "LATEST" },
  { label: "Banner (pick from the Banner library)", value: "BANNER" },
  { label: "Collection (pick one collection)", value: "COLLECTION" },
];

function Homepage() {
  const demoSections = useHomepage();
  const apiQuery = useAdminHomepageQuery();
  const mutation = useAdminHomepageMutation();
  const bannerChoices = useQuery({
    queryKey: ["admin", "banners", "choices"],
    enabled: !DEMO_MODE,
    queryFn: async () =>
      (await api.get<{ data: Array<Record<string, unknown>> }>("/admin/banners?limit=100")).data,
  });
  const collectionChoices = useQuery({
    queryKey: ["admin", "collections", "choices"],
    enabled: !DEMO_MODE,
    queryFn: async () =>
      (await api.get<{ data: Array<Record<string, unknown>> }>("/admin/collections?limit=100"))
        .data,
  });
  const isLoading = !DEMO_MODE && apiQuery.isLoading;
  const isError = !DEMO_MODE && apiQuery.isError;

  const apiSections: EditableSection[] = useMemo(
    () => (apiQuery.data?.data ?? []).map(apiSectionToEditable),
    [apiQuery.data],
  );

  // Live-mode: maintain editable local state separate from query cache
  const [localSections, setLocalSections] = useState<EditableSection[]>([]);
  const initialized = useRef(false);
  useEffect(() => {
    if (!DEMO_MODE && apiSections.length > 0 && !initialized.current) {
      setLocalSections(apiSections);
      initialized.current = true;
    }
  }, [apiSections]);
  useEffect(() => {
    if (!DEMO_MODE && apiQuery.data) {
      setLocalSections(apiSections);
    }
  }, [apiQuery.dataUpdatedAt]);

  const sections: EditableSection[] = DEMO_MODE
    ? demoSections.map((s) => ({ ...s, _dbId: "", _updatedAt: undefined }))
    : localSections;

  const movies = useMovies();
  const banners = useBanners();
  const [renaming, setRenaming] = useState<EditableSection | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [picking, setPicking] = useState<EditableSection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSection, setNewSection] = useState({
    key: "",
    displayTitle: "",
    type: "MANUAL" as ApiHomeSection["type"],
    contentType: "MOVIE" as NonNullable<ApiHomeSection["contentType"]>,
    bannerId: "",
    collectionId: "",
    itemLimit: 12,
  });
  const [deleting, setDeleting] = useState<EditableSection | null>(null);
  const [saving, setSaving] = useState(false);

  const openPicker = (s: EditableSection) => {
    setPicking(s);
    setPickerOpen(true);
  };

  const setSectionsFn = (fn: (o: EditableSection[]) => EditableSection[]) => {
    if (DEMO_MODE) {
      // Keep demo-mode store updated
      update((s) => ({
        homepage: fn(s.homepage as unknown as EditableSection[]) as unknown as HomeSection[],
      }));
    } else {
      setLocalSections(fn);
    }
  };

  const patch = (id: HomeSection["id"], p: Partial<EditableSection>) =>
    setSectionsFn((o) => o.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const reorder = useReorder(sections, (next) => setSectionsFn(() => next));

  const defaultTitle = (id: HomeSection["id"]) =>
    HOME_DEFAULTS.find((d) => d.id === id)?.title ?? id;

  const featured = movies.find((m) => m.status === "Published")?.title || "Featured title";

  const handleSave = async () => {
    if (DEMO_MODE) {
      toast.success("Homepage layout saved. Changes are live.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      // 1. Persist per-section field changes FIRST: the reorder below bumps every row's updatedAt, which made these (stale-checked) edits fail with 409
      const originals = apiQuery.data?.data ?? [];
      for (const s of localSections) {
        const orig = originals.find((o) => o.id === s._dbId);
        if (!orig) continue;
        const changed =
          s.title !== orig.displayTitle || s.enabled !== orig.enabled || s.limit !== orig.itemLimit;
        if (changed) {
          await mutation.update.mutateAsync({
            id: s._dbId,
            data: {
              displayTitle: s.title,
              enabled: s.enabled,
              itemLimit: s.limit,
              // the stamp from the latest server copy, not the one captured when the page first loaded (earlier saves change it)
              ...(orig.updatedAt ? { expectedUpdatedAt: orig.updatedAt } : {}),
            },
          });
        }
      }
      // 2. Persist display order (last, for the reason above)
      if (localSections.length > 0) {
        await mutation.reorder.mutateAsync(
          localSections.map((s, i) => ({ id: s._dbId, displayOrder: i })),
        );
      }
      toast.success("Homepage layout saved. Changes are live.");
    } catch {
      toast.error("Failed to save layout. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    // say exactly what is missing instead of leaving the button dead
    const missing = [
      !newSection.key.trim() && "a key",
      !newSection.displayTitle.trim() && "a display title",
      newSection.type === "BANNER" && !newSection.bannerId && "a banner to show",
      newSection.type === "COLLECTION" && !newSection.collectionId && "a collection to show",
    ].filter(Boolean);
    if (missing.length) return void toast.warning(`Please add ${missing.join(" and ")}.`);
    try {
      await mutation.create.mutateAsync({
        key: newSection.key.trim(),
        displayTitle: newSection.displayTitle.trim(),
        type: newSection.type,
        // Dynamic sections must declare which catalog they resolve against — a MANUAL section mixes
        // types by its own item picks and must never set this (see homepage.validator.ts).
        ...(["MANUAL", "BANNER", "COLLECTION", "HERO"].includes(newSection.type)
          ? {}
          : { contentType: newSection.contentType }),
        ...(newSection.type === "BANNER" ? { bannerId: newSection.bannerId } : {}),
        ...(newSection.type === "COLLECTION" ? { collectionId: newSection.collectionId } : {}),
        itemLimit: newSection.itemLimit,
        displayOrder: sections.length,
        enabled: true,
      });
      setCreating(false);
      setNewSection({
        key: "",
        displayTitle: "",
        type: "MANUAL",
        contentType: "MOVIE",
        bannerId: "",
        collectionId: "",
        itemLimit: 12,
      });
      toast.success("Section created.");
      initialized.current = false;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create section.";
      toast.error(msg);
    }
  };

  const handleDelete = async (s: EditableSection) => {
    if (!s._dbId) return;
    try {
      await mutation.remove.mutateAsync(s._dbId);
      setDeleting(null);
      toast.success(`"${s.title}" deleted.`);
      initialized.current = false;
    } catch {
      toast.error("Failed to delete section.");
    }
  };

  if (isLoading)
    return (
      <div className="space-y-4 p-6">
        <Skel className="h-8 w-64" />
        <Skel className="h-96 w-full" />
      </div>
    );
  if (isError)
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Failed to load homepage layout.
      </div>
    );

  return (
    <>
      <PageHeader
        title="Homepage"
        sub="Shape the first impression. Arrange, rename and tune the sections your audience sees."
        actions={
          <div className="flex gap-2">
            {!DEMO_MODE && (
              <Btn onClick={() => setCreating(true)}>
                <Plus /> Add Section
              </Btn>
            )}
            <Btn variant="primary" onClick={handleSave} disabled={saving}>
              <Check /> {saving ? "Saving…" : "Save layout"}
            </Btn>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Panel>
          {sections.map((s, i) => {
            const rd = reorder(i);
            const canManual = s.sourceNote ? false : DEMO_MODE ? manualCapable.has(s.id) : true;
            const heroLimit = s.id === "hero";
            return (
              <div
                key={s._dbId || s.id}
                {...rd.row}
                className={cn(
                  "flex flex-wrap items-center gap-3 border-b border-border px-4 py-3.5 last:border-0",
                  !s.enabled && "opacity-60",
                )}
              >
                <DragHandle {...rd.handle} />
                <span className="w-6 text-xs font-bold text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{s.title}</span>
                    {HOME_DEFAULTS.find((d) => d.id === s.id) && s.title !== defaultTitle(s.id) && (
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Renamed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.sourceNote ??
                      (s.id === "hero"
                        ? heroNote(s)
                        : (note[s.id] ??
                          (s.mode === "manual"
                            ? `${s.items.length} hand-picked ${s.items.length === 1 ? "title" : "titles"}`
                            : "Chosen automatically from flags and activity")))}{" "}
                    · {s.enabled ? "Visible" : "Hidden from customers"}
                  </div>
                </div>
                {canManual && (
                  <div
                    role="group"
                    aria-label={`${s.title} content source`}
                    className="flex rounded-md border border-border p-0.5 text-xs font-semibold"
                  >
                    {(["auto", "manual"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={s.mode === m}
                        onClick={() => patch(s.id, { mode: m })}
                        className={cn(
                          "h-7 rounded px-3",
                          s.mode === m
                            ? "bg-surface-3 text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {m === "auto" ? "Automatic" : "Manual"}
                      </button>
                    ))}
                  </div>
                )}
                {canManual && s.mode === "manual" && (
                  <Btn size="sm" onClick={() => openPicker(s)}>
                    <ListPlus /> Select Content
                  </Btn>
                )}
                {s.id === "hero" && s.mode === "auto" && (
                  <select
                    aria-label="Hero automatic source"
                    value={s.autoFlag ?? "featured"}
                    onChange={(e) => patch(s.id, { autoFlag: e.target.value as HomeAutoFlag })}
                    className="h-8 rounded-md border border-input bg-surface-2 px-2 text-xs"
                  >
                    {Object.entries(AUTO_FLAG_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label={`${s.title} ${heroLimit ? "slide" : "item"} limit`}
                  value={s.limit}
                  onChange={(e) => patch(s.id, { limit: Number(e.target.value) })}
                  className="h-8 rounded-md border border-input bg-surface-2 px-2 text-xs"
                >
                  {(heroLimit ? [1, 2, 3, 4, 6] : [6, 8, 12, 16, 20, 24]).map((n) => (
                    <option key={n} value={n}>
                      {n} {heroLimit ? (n === 1 ? "slide" : "slides") : "items"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Move ${s.title} up`}
                  className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => rd.move(-1)}
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${s.title} down`}
                  className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3 disabled:opacity-30"
                  disabled={i === sections.length - 1}
                  onClick={() => rd.move(1)}
                >
                  <ArrowDown className="size-4" />
                </button>
                <Toggle
                  checked={s.enabled}
                  onChange={(v) => patch(s.id, { enabled: v })}
                  name={`Enable ${s.title} section`}
                />
                <button
                  type="button"
                  aria-label={`Rename ${s.title}`}
                  className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3"
                  onClick={() => {
                    setRenaming(s);
                    setDraftTitle(s.title);
                  }}
                >
                  <Pencil className="size-4" />
                </button>
                {!DEMO_MODE && s._dbId && (
                  <button
                    type="button"
                    aria-label={`Delete ${s.title}`}
                    className="grid size-8 place-items-center rounded-md text-soft hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleting(s)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
          {sections.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No sections yet.{" "}
              {!DEMO_MODE && (
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => setCreating(true)}
                >
                  Add the first one.
                </button>
              )}
            </div>
          )}
        </Panel>

        <Panel className="h-fit">
          <PanelHeader
            title="Customer preview"
            sub="Homepage section order"
            action={
              <Link
                to="/"
                className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3"
                aria-label="Open the customer homepage"
              >
                <Eye className="size-4" />
              </Link>
            }
          />
          <div className="space-y-3 p-5">
            <div className="text-[11px] font-black tracking-widest text-primary-text">
              STREAMVERSE
            </div>
            {sections.some((s) => s.id === "hero" && s.enabled) && (
              <div className="rounded-md bg-gradient-to-br from-primary-deep/60 to-ink p-4">
                <div className="eyebrow text-[9px] text-soft">Featured tonight</div>
                <div className="mt-1 text-lg font-black uppercase">{featured}</div>
                <div className="mt-2 inline-block rounded bg-primary px-2 py-0.5 text-[9px] font-bold">
                  WATCH NOW
                </div>
              </div>
            )}
            {sections
              .filter((s) => s.enabled && s.id !== "hero")
              .slice(0, 6)
              .map((s) => (
                <div key={s._dbId || s.id}>
                  <div className="text-xs font-bold">{s.title}</div>
                  <div className="text-xs tracking-widest text-muted-foreground">••••••••••••</div>
                </div>
              ))}
          </div>
        </Panel>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="border-border bg-surface-2 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename section</DialogTitle>
            <DialogDescription>
              Only the heading customers see changes. The section keeps working because it is
              tracked by its internal key:{" "}
              <code className="rounded bg-surface-3 px-1 text-xs">{renaming?.id}</code>.
            </DialogDescription>
          </DialogHeader>
          <Field label="Display name" required>
            <TextInput
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renaming && draftTitle.trim()) {
                  patch(renaming.id, { title: draftTitle.trim() });
                  setRenaming(null);
                  toast.success("Section renamed — click Save layout to persist.");
                }
              }}
            />
          </Field>
          <div className="flex justify-between gap-2">
            {HOME_DEFAULTS.find((d) => d.id === renaming?.id) && (
              <Btn onClick={() => renaming && setDraftTitle(defaultTitle(renaming.id))}>
                <RotateCcw /> Reset to default
              </Btn>
            )}
            <div className="flex gap-2 ml-auto">
              <Btn onClick={() => setRenaming(null)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={!draftTitle.trim()}
                onClick={() => {
                  if (renaming) patch(renaming.id, { title: draftTitle.trim() });
                  setRenaming(null);
                  toast.success("Section renamed — click Save layout to persist.");
                }}
              >
                Save name
              </Btn>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create section dialog */}
      {!DEMO_MODE && (
        <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
          <DialogContent className="border-border bg-surface-2 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add section</DialogTitle>
              <DialogDescription>
                Create a new homepage section. The key is permanent and used internally.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Key (internal, permanent)" required>
                <TextInput
                  value={newSection.key}
                  onChange={(e) =>
                    setNewSection((p) => ({
                      ...p,
                      key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                    }))
                  }
                  placeholder="e.g. my_custom_section"
                />
              </Field>
              <Field label="Display title" required>
                <TextInput
                  value={newSection.displayTitle}
                  onChange={(e) => setNewSection((p) => ({ ...p, displayTitle: e.target.value }))}
                  placeholder="e.g. My Custom Section"
                />
              </Field>
              <Field label="Section source">
                <select
                  value={newSection.type}
                  onChange={(e) =>
                    setNewSection((p) => ({ ...p, type: e.target.value as ApiHomeSection["type"] }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-surface-2 px-3 text-sm"
                >
                  {SECTION_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              {newSection.type === "BANNER" && (
                <Field
                  label="Banner"
                  required
                  hint="Create banners in Admin > Banners; here you only choose where one appears."
                >
                  <select
                    aria-label="Banner"
                    data-testid="section-banner"
                    value={newSection.bannerId}
                    onChange={(e) => setNewSection((p) => ({ ...p, bannerId: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-surface-2 px-3 text-sm"
                  >
                    <option value="">Choose a banner…</option>
                    {(bannerChoices.data ?? []).map((b) => (
                      <option key={String(b["id"])} value={String(b["id"])}>
                        {String(b["title"])} ({String(b["type"]).toLowerCase().replace("_", " ")})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {newSection.type === "COLLECTION" && (
                <Field label="Collection" required>
                  <select
                    aria-label="Collection"
                    data-testid="section-collection"
                    value={newSection.collectionId}
                    onChange={(e) => setNewSection((p) => ({ ...p, collectionId: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-surface-2 px-3 text-sm"
                  >
                    <option value="">Choose a collection…</option>
                    {(collectionChoices.data ?? []).map((c) => (
                      <option key={String(c["id"])} value={String(c["id"])}>
                        {String(c["name"])}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {!["MANUAL", "BANNER", "COLLECTION", "HERO"].includes(newSection.type) && (
                <Field label="Catalog" required>
                  <select
                    value={newSection.contentType}
                    onChange={(e) =>
                      setNewSection((p) => ({
                        ...p,
                        contentType: e.target.value as NonNullable<ApiHomeSection["contentType"]>,
                      }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-surface-2 px-3 text-sm"
                  >
                    <option value="MOVIE">Movies</option>
                    <option value="EBOOK">eBooks</option>
                    <option value="AUDIOBOOK">Audiobooks</option>
                  </select>
                </Field>
              )}
              <Field label="Item limit">
                <select
                  value={newSection.itemLimit}
                  onChange={(e) =>
                    setNewSection((p) => ({ ...p, itemLimit: Number(e.target.value) }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-surface-2 px-3 text-sm"
                >
                  {[6, 8, 10, 12, 16, 20, 24].map((n) => (
                    <option key={n} value={n}>
                      {n} items
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn onClick={() => setCreating(false)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={mutation.create.isPending}
                onClick={handleCreate}
              >
                <Plus /> Create Section
              </Btn>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation dialog */}
      {!DEMO_MODE && (
        <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <DialogContent className="border-border bg-surface-2 sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete section?</DialogTitle>
              <DialogDescription>
                This will permanently remove &ldquo;{deleting?.title}&rdquo; and all its pinned
                content. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Btn onClick={() => setDeleting(null)}>Cancel</Btn>
              <Btn
                variant="danger"
                disabled={mutation.remove.isPending}
                onClick={() => deleting && handleDelete(deleting)}
              >
                <Trash2 /> Delete
              </Btn>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <ContentPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={`Select content: ${picking?.title ?? ""}`}
        description="These titles replace the automatic selection. Drag to reorder."
        initial={picking?.items ?? []}
        types={picking?.id === "hero" ? ["Movie"] : ["Movie", "eBook", "Audiobook"]}
        onSave={(items) => {
          if (!picking) return;
          patch(picking.id, { items });
          toast.success(
            `${picking.title}: ${items.length} ${items.length === 1 ? "title" : "titles"} selected`,
          );
        }}
      />
    </>
  );
}
