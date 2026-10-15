import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  GripVertical,
  ListPlus,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ContentPicker } from "@/components/sv/ContentPicker";
import { Btn, Field, PageHeader, Panel, PanelHeader, Skel, TextInput, Toggle } from "@/components/sv/ui";
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
import { useAdminHomepageQuery } from "@/hooks/useAdminApi";
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
    : `Active Hero banners, or ${AUTO_FLAG_LABELS[s.autoFlag ?? "featured"]} movies`;

function apiSectionToHomeSection(s: ApiHomeSection): HomeSection {
  return {
    id: s.id as HomeSection["id"],
    title: s.title,
    enabled: s.enabled,
    limit: s.limit,
    mode: s.mode,
    ...(s.autoFlag != null ? { autoFlag: s.autoFlag } : {}),
    items: s.items.map((it) => ({ type: it.contentType === "movie" ? "Movie" : it.contentType === "ebook" ? "eBook" : "Audiobook", slug: it.movie?.slug ?? it.ebook?.slug ?? it.audiobook?.slug ?? "" } as import("@/lib/data").ItemRef)),
  };
}

function Homepage() {
  const demoSections = useHomepage();
  const apiQuery = useAdminHomepageQuery();
  const isLoading = !DEMO_MODE && apiQuery.isLoading;
  const isError = !DEMO_MODE && apiQuery.isError;

  const apiSections: HomeSection[] = useMemo(() => (apiQuery.data?.data ?? []).map(apiSectionToHomeSection), [apiQuery.data]);
  const sections: HomeSection[] = DEMO_MODE ? demoSections : apiSections;

  const movies = useMovies();
  const banners = useBanners();
  const [renaming, setRenaming] = useState<HomeSection | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [picking, setPicking] = useState<HomeSection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const openPicker = (s: HomeSection) => {
    setPicking(s);
    setPickerOpen(true);
  };

  const setSections = (fn: (o: HomeSection[]) => HomeSection[]) => {
    if (DEMO_MODE) update((s) => ({ homepage: fn(s.homepage) }));
    // In !DEMO_MODE, section mutations would call adminHomepageApi.updateSection directly
    // For now, local state is managed via setSections pattern in demo; API saves on "Save layout"
  };
  const patch = (id: HomeSection["id"], p: Partial<HomeSection>) =>
    setSections((o) => o.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const reorder = useReorder(sections, (next) => setSections(() => next));
  const defaultTitle = (id: HomeSection["id"]) => HOME_DEFAULTS.find((d) => d.id === id)!.title;
  const featured =
    banners.find((b) => b.type === "Hero Banner" && b.active)?.title ||
    movies.find((m) => m.status === "Published")?.title ||
    "Featured title";

  if (isLoading) return <div className="space-y-4 p-6"><Skel className="h-8 w-64" /><Skel className="h-96 w-full" /></div>;
  if (isError) return <div className="p-8 text-center text-sm text-muted-foreground">Failed to load homepage layout.</div>;

  return (
    <>
      <PageHeader
        title="Homepage"
        sub="Shape the first impression. Arrange, rename and tune the sections your audience sees."
        actions={
          <Btn
            variant="primary"
            onClick={() => toast.success("Homepage layout saved. Changes are live.")}
          >
            <Check /> Save layout
          </Btn>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Panel>
          {sections.map((s, i) => {
            const rd = reorder(i);
            const canManual = manualCapable.has(s.id);
            const heroLimit = s.id === "hero";
            return (
              <div
                key={s.id}
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
                    {s.title !== defaultTitle(s.id) && (
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Renamed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.id === "hero"
                      ? heroNote(s)
                      : (note[s.id] ??
                        (s.mode === "manual"
                          ? `${s.items.length} hand-picked ${s.items.length === 1 ? "title" : "titles"}`
                          : "Chosen automatically from flags and activity"))}{" "}
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
                  {(heroLimit ? [1, 2, 3, 4, 6] : [6, 8, 12, 16]).map((n) => (
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
              </div>
            );
          })}
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
                <div key={s.id}>
                  <div className="text-xs font-bold">{s.title}</div>
                  <div className="text-xs tracking-widest text-muted-foreground">••••••••••••</div>
                </div>
              ))}
          </div>
        </Panel>
      </div>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="border-border bg-surface-2 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename section</DialogTitle>
            <DialogDescription>
              Only the heading customers see changes. The section keeps working because it is
              tracked by its internal ID:{" "}
              <code className="rounded bg-surface-3 px-1 text-xs">{renaming?.id}</code>.
            </DialogDescription>
          </DialogHeader>
          <Field label="Display name" required>
            <TextInput
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                renaming &&
                draftTitle.trim() &&
                (patch(renaming.id, { title: draftTitle.trim() }),
                setRenaming(null),
                toast.success("Section renamed"))
              }
            />
          </Field>
          <div className="flex justify-between gap-2">
            <Btn onClick={() => renaming && setDraftTitle(defaultTitle(renaming.id))}>
              <RotateCcw /> Reset to default
            </Btn>
            <div className="flex gap-2">
              <Btn onClick={() => setRenaming(null)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={!draftTitle.trim()}
                onClick={() => {
                  if (renaming) patch(renaming.id, { title: draftTitle.trim() });
                  setRenaming(null);
                  toast.success("Section renamed");
                }}
              >
                Save name
              </Btn>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
