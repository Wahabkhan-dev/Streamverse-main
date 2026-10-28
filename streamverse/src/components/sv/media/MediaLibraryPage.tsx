import {
  Activity,
  CheckSquare,
  HardDrive,
  ImageIcon,
  LayoutGrid,
  List,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  MediaCategory,
  MediaListItem,
  MediaListParams,
  ReconcileReport,
} from "@/api/mediaLibrary.api";
import { isApiError } from "@/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaListQuery, useMediaMutations, useMediaStatsQuery } from "@/hooks/useMediaLibrary";
import { cn } from "@/lib/utils";
import {
  Btn,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Panel,
  Skel,
  StatusBadge,
  TextInput,
} from "../ui";
import {
  CATEGORY_LABEL,
  fmtBytes,
  fmtDuration,
  roleLabel,
  ROLE_OPTIONS,
  STATUS_LABEL,
} from "./format";
import { MediaDetailDrawer } from "./MediaDetailDrawer";
import { MediaThumb } from "./MediaThumb";
import { ProcessingBar } from "./ProcessingBar";
import { UploadPanel } from "./UploadPanel";
import { useUploadQueue } from "./useUploadQueue";

/** Everything the page reads from the URL, so a filtered view can be bookmarked, shared and survives a refresh. */
export interface MediaSearch {
  q?: string;
  category?: MediaCategory;
  role?: string;
  status?: string;
  attached?: NonNullable<MediaListParams["attachedType"]>;
  sort?: NonNullable<MediaListParams["sort"]>;
  page?: number;
  view?: "grid" | "list";
  asset?: string;
}

/** A patch may clear a key by setting it to undefined. */
export type MediaSearchPatch = { [K in keyof MediaSearch]?: MediaSearch[K] | undefined };

const CATEGORIES: MediaCategory[] = ["images", "videos", "audio", "documents"];
const ATTACHED: Array<[NonNullable<MediaSearch["attached"]>, string]> = [
  ["movies", "Movies"],
  ["ebooks", "eBooks"],
  ["audiobooks", "Audiobooks"],
  ["homepage", "Homepage"],
  ["banners", "Banners"],
  ["collections", "Collections"],
  ["unattached", "Unattached"],
];
const STATUSES = ["UPLOADING", "PROCESSING", "READY", "FAILED"] as const;
const SORTS: Array<[NonNullable<MediaSearch["sort"]>, string]> = [
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["name", "Name"],
  ["size", "Size"],
  ["type", "Type"],
];
const PAGE_SIZE = 24;

const selectCls =
  "h-9 min-w-0 rounded-md border border-input bg-surface-2 px-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function Stat({
  label,
  value,
  sub,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  testId?: string;
}) {
  return (
    <Panel className="p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-bold tracking-tight" data-testid={testId}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </Panel>
  );
}

function usedLabel(it: MediaListItem): string {
  if (!it.usageCount) return "Unattached";
  const first = it.usedBy[0]!;
  return it.usageCount > 1 ? `${first.title} +${it.usageCount - 1}` : first.title;
}

function HealthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { reconcile } = useMediaMutations();
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const run = () =>
    reconcile.mutate(undefined, {
      onSuccess: (r) => setReport(r.data),
      onError: (e) => toast.error(isApiError(e) ? e.message : "The check failed"),
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto border-border bg-surface-2"
        data-testid="health-dialog"
      >
        <DialogHeader>
          <DialogTitle>Storage health</DialogTitle>
          <DialogDescription>
            Compares the library with the storage bucket. It only reports; nothing is deleted or
            changed automatically.
          </DialogDescription>
        </DialogHeader>
        <Btn
          variant="primary"
          onClick={run}
          disabled={reconcile.isPending}
          data-testid="health-run"
        >
          <Activity /> {reconcile.isPending ? "Checking…" : report ? "Check again" : "Run check"}
        </Btn>
        {report && (
          <div className="space-y-4 text-sm" data-testid="health-report">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Files checked" value={String(report.checked)} />
              <Stat label="Missing in storage" value={String(report.missing.length)} />
              <Stat
                label="Unknown objects in storage"
                value={String(report.orphans.length)}
                sub={
                  report.orphanScan.truncated
                    ? `first ${report.orphanScan.scannedKeys} scanned`
                    : `${report.orphanScan.scannedKeys} scanned`
                }
              />
              <Stat
                label="Failed / stuck uploads"
                value={`${report.failed} / ${report.stuckUploads}`}
              />
            </div>
            {report.missing.length > 0 && (
              <section>
                <h3 className="mb-1 font-bold">Database rows whose file is gone</h3>
                <ul className="space-y-1 text-xs">
                  {report.missing.map((m) => (
                    <li key={m.id} className="rounded border border-border px-2 py-1">
                      {m.fileName ?? m.id} · {roleLabel(m.type)}{" "}
                      {m.used ? "· in use (customers affected)" : "· unused"}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {report.orphans.length > 0 && (
              <section>
                <h3 className="mb-1 font-bold">Files in storage with no library entry</h3>
                <ul className="space-y-1 text-xs">
                  {report.orphans.slice(0, 50).map((o) => (
                    <li key={o.key} className="break-all rounded border border-border px-2 py-1">
                      {o.key} · {fmtBytes(o.sizeBytes)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {report.missing.length === 0 && report.orphans.length === 0 && (
              <p className="text-muted-foreground">Everything checked is in sync.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploaded: () => void;
}) {
  const queue = useUploadQueue(() => onUploaded());
  return (
    <Dialog
      open={open}
      onOpenChange={(o) =>
        !o && queue.busy
          ? toast.info("Uploads are still running. Cancel them first, or wait for them to finish.")
          : onOpenChange(o)
      }
    >
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto border-border bg-surface-2"
        data-testid="upload-dialog"
      >
        <DialogHeader>
          <DialogTitle>Upload media</DialogTitle>
          <DialogDescription>
            Files go straight to storage and are verified before they appear in the library.
          </DialogDescription>
        </DialogHeader>
        <UploadPanel queue={queue} />
      </DialogContent>
    </Dialog>
  );
}

export function MediaLibraryPage({
  search,
  setSearch,
}: {
  search: MediaSearch;
  setSearch: (patch: MediaSearchPatch, opts?: { keepPage?: boolean }) => void;
}) {
  const view = search.view ?? "grid";
  const page = search.page ?? 1;
  const [typed, setTyped] = useState(search.q ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const { bulkDelete } = useMediaMutations();

  // debounce typing into the URL so every keystroke is not a request
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== typed.trim()) setSearch({ q: typed.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);
  useEffect(() => setTyped(search.q ?? ""), [search.q]);

  const params = useMemo<MediaListParams>(
    () => ({
      page,
      limit: PAGE_SIZE,
      sort: search.sort ?? "newest",
      ...(search.q ? { search: search.q } : {}),
      ...(search.category ? { category: search.category } : {}),
      ...(search.role ? { assetRole: search.role } : {}),
      ...(search.status ? { status: search.status } : {}),
      ...(search.attached ? { attachedType: search.attached } : {}),
    }),
    [page, search.sort, search.q, search.category, search.role, search.status, search.attached],
  );
  const list = useMediaListQuery(params);
  const stats = useMediaStatsQuery();
  const items = list.data?.data ?? [];
  const meta = list.data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const filtered = !!(
    search.q ||
    search.category ||
    search.role ||
    search.status ||
    search.attached
  );

  // selection belongs to the visible page
  useEffect(() => setSelected(new Set()), [params]);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const runBulk = () =>
    bulkDelete.mutate([...selected], {
      onSuccess: (r) => {
        const { deleted, blocked, results } = r.data;
        if (deleted) toast.success(`${deleted} file${deleted === 1 ? "" : "s"} deleted`);
        if (blocked)
          toast.warning(
            `${blocked} skipped: ${results.find((x) => !x.deleted)?.reason ?? "in use"}`,
          );
        setSelected(new Set());
      },
      onError: (e) => toast.error(isApiError(e) ? e.message : "Bulk delete failed"),
    });

  const s = stats.data?.data;
  const clear = () => {
    setTyped("");
    setSearch({
      q: undefined,
      category: undefined,
      role: undefined,
      status: undefined,
      attached: undefined,
      sort: undefined,
    });
  };

  return (
    <div data-testid="media-library">
      <PageHeader
        title="Media Library"
        sub="Every picture, video, audio file and book file on StreamVerse, in one place."
        actions={
          <>
            <Btn onClick={() => setHealthOpen(true)} data-testid="health-open">
              <Activity /> Storage health
            </Btn>
            <Btn variant="primary" onClick={() => setUploadOpen(true)} data-testid="upload-open">
              <Upload /> Upload Media
            </Btn>
          </>
        }
      />

      <div
        className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6"
        aria-label="Library totals"
      >
        {stats.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="h-[74px]" />)
        ) : s ? (
          <>
            <Stat label="All files" value={String(s.total)} testId="stat-total" />
            <Stat
              label="Images"
              value={String(s.byCategory.images)}
              sub={fmtBytes(s.bytesByCategory.images)}
            />
            <Stat
              label="Videos"
              value={String(s.byCategory.videos)}
              sub={fmtBytes(s.bytesByCategory.videos)}
            />
            <Stat
              label="Audio"
              value={String(s.byCategory.audio)}
              sub={fmtBytes(s.bytesByCategory.audio)}
            />
            <Stat label="Storage used" value={fmtBytes(s.storageBytes)} testId="stat-storage" />
            <Stat
              label="Unattached"
              value={String(s.unattached)}
              sub={`${s.byStatus["FAILED"] ?? 0} failed`}
            />
          </>
        ) : (
          <p className="col-span-full text-sm text-muted-foreground">
            Totals are unavailable right now.
          </p>
        )}
      </div>

      <Panel className="mb-4 space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <TextInput
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search file name, title, content code or type"
              aria-label="Search media"
              className="h-9 pl-9"
              data-testid="media-search"
            />
          </div>
          <select
            className={selectCls}
            aria-label="Content"
            value={search.attached ?? ""}
            onChange={(e) =>
              setSearch({ attached: (e.target.value || undefined) as MediaSearch["attached"] })
            }
            data-testid="filter-attached"
          >
            <option value="">All content</option>
            {ATTACHED.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            aria-label="Role"
            value={search.role ?? ""}
            onChange={(e) => setSearch({ role: e.target.value || undefined })}
            data-testid="filter-role"
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            aria-label="Status"
            value={search.status ?? ""}
            onChange={(e) => setSearch({ status: e.target.value || undefined })}
            data-testid="filter-status"
          >
            <option value="">Any status</option>
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {st === "UPLOADING"
                  ? "Uploading"
                  : st === "PROCESSING"
                    ? "Processing"
                    : st === "READY"
                      ? "Ready"
                      : "Failed"}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            aria-label="Sort"
            value={search.sort ?? "newest"}
            onChange={(e) => setSearch({ sort: e.target.value as MediaSearch["sort"] })}
            data-testid="sort"
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="flex rounded-md border border-border" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={view === "grid"}
              aria-label="Grid view"
              onClick={() => setSearch({ view: "grid" }, { keepPage: true })}
              className={cn(
                "grid size-9 place-items-center rounded-l-md",
                view === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-soft hover:bg-surface-3",
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              aria-label="List view"
              onClick={() => setSearch({ view: "list" }, { keepPage: true })}
              className={cn(
                "grid size-9 place-items-center rounded-r-md",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-soft hover:bg-surface-3",
              )}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
        <div
          className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5"
          role="group"
          aria-label="File type"
        >
          {[undefined, ...CATEGORIES].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={search.category === c}
              onClick={() => setSearch({ category: c })}
              data-testid={`type-${c ?? "all"}`}
              className={cn(
                "h-8 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors",
                search.category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-2 text-soft hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {c ? CATEGORY_LABEL[c] : "All"}
            </button>
          ))}
          {filtered && (
            <button
              type="button"
              onClick={clear}
              className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary-text hover:underline"
              data-testid="clear-filters"
            >
              <X className="size-3" /> Clear filters
            </button>
          )}
        </div>
      </Panel>

      {selected.size > 0 && (
        <div
          className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-surface-2 px-4 py-2 text-sm shadow-lg"
          data-testid="bulk-bar"
        >
          <span className="font-semibold">{selected.size} selected</span>
          <Btn
            size="sm"
            variant="danger"
            onClick={() => setBulkConfirm(true)}
            data-testid="bulk-delete"
          >
            <Trash2 /> Delete unattached
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Btn>
          <span className="text-xs text-muted-foreground">
            Files that are in use are skipped automatically.
          </span>
        </div>
      )}

      {list.isError ? (
        <EmptyState
          title="The Media Library could not be loaded"
          sub={isApiError(list.error) ? list.error.message : "Check your connection and try again."}
          action={<Btn onClick={() => void list.refetch()}>Try again</Btn>}
        />
      ) : list.isLoading ? (
        <div
          className={
            view === "grid"
              ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
              : "space-y-2"
          }
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <Skel key={i} className={view === "grid" ? "aspect-[4/3]" : "h-16"} />
          ))}
        </div>
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={ImageIcon}
            title="No files match these filters"
            sub="Try a different search or clear the filters."
            action={<Btn onClick={clear}>Clear filters</Btn>}
          />
        ) : (
          <EmptyState
            icon={HardDrive}
            title="Your library is empty"
            sub="Upload pictures, video, audio or books and they will appear here."
            action={
              <Btn variant="primary" onClick={() => setUploadOpen(true)}>
                Upload Media
              </Btn>
            }
          />
        )
      ) : view === "grid" ? (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
          aria-label="Media files"
          data-testid="media-grid"
        >
          {items.map((it) => (
            <li key={it.id} className="relative" data-testid="media-item" data-asset-id={it.id}>
              <button
                type="button"
                onClick={() => setSearch({ asset: it.id }, { keepPage: true })}
                className="block w-full overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${it.displayTitle || it.fileName || "file"}`}
              >
                <MediaThumb item={it} className="aspect-[4/3] w-full" />
                <span className="block truncate px-2 pt-1.5 text-xs font-medium">
                  {it.displayTitle || it.fileName || "Untitled"}
                </span>
                <span className="block truncate px-2 text-[10px] text-muted-foreground">
                  {roleLabel(it.type)} · {fmtBytes(it.sizeBytes)}
                </span>
                <span
                  className={cn(
                    "block truncate px-2 pb-1.5 text-[10px]",
                    it.usageCount ? "text-soft" : "text-muted-foreground",
                  )}
                >
                  {usedLabel(it)}
                </span>
                {it.progress && <ProcessingBar progress={it.progress} compact className="px-2 pb-2" />}
              </button>
              <button
                type="button"
                aria-label={selected.has(it.id) ? "Deselect" : "Select"}
                aria-pressed={selected.has(it.id)}
                onClick={() => toggle(it.id)}
                className="absolute left-1.5 top-1.5 grid size-7 place-items-center rounded-md bg-ink/70 text-foreground backdrop-blur hover:bg-ink"
              >
                {selected.has(it.id) ? (
                  <CheckSquare className="size-4 text-primary-text" />
                ) : (
                  <Square className="size-4" />
                )}
              </button>
              {it.status !== "READY" && (
                <span className="absolute right-1.5 top-1.5">
                  <StatusBadge status={STATUS_LABEL[it.status]} />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul
          className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface"
          aria-label="Media files"
          data-testid="media-list"
        >
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 px-3 py-2"
              data-testid="media-item"
              data-asset-id={it.id}
            >
              <button
                type="button"
                aria-label={selected.has(it.id) ? "Deselect" : "Select"}
                aria-pressed={selected.has(it.id)}
                onClick={() => toggle(it.id)}
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-surface-3"
              >
                {selected.has(it.id) ? (
                  <CheckSquare className="size-4 text-primary-text" />
                ) : (
                  <Square className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setSearch({ asset: it.id }, { keepPage: true })}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label={`Open ${it.displayTitle || it.fileName || "file"}`}
              >
                <MediaThumb item={it} className="size-12 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {it.displayTitle || it.fileName || "Untitled"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {roleLabel(it.type)} · {fmtBytes(it.sizeBytes)}
                    {it.width && it.height ? ` · ${it.width}x${it.height}` : ""}
                    {it.durationSeconds != null ? ` · ${fmtDuration(it.durationSeconds)}` : ""}
                  </span>
                  {it.progress && (
                    <ProcessingBar progress={it.progress} compact className="mt-1 max-w-sm" />
                  )}
                </span>
                <span className="hidden w-48 shrink-0 truncate text-xs text-soft md:block">
                  {usedLabel(it)}
                </span>
                <span className="hidden w-28 shrink-0 text-xs text-muted-foreground lg:block">
                  {new Date(it.createdAt).toLocaleDateString()}
                </span>
                <span className="shrink-0">
                  <StatusBadge status={STATUS_LABEL[it.status]} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {meta && totalPages > 1 && (
        <nav
          className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
          aria-label="Pagination"
        >
          <span className="text-xs text-muted-foreground" data-testid="page-info">
            Page {meta.page} of {totalPages} · {meta.total} files
          </span>
          <div className="flex gap-2">
            <Btn
              size="sm"
              disabled={page <= 1}
              onClick={() => setSearch({ page: page - 1 }, { keepPage: true })}
            >
              Previous
            </Btn>
            <Btn
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setSearch({ page: page + 1 }, { keepPage: true })}
            >
              Next
            </Btn>
          </div>
        </nav>
      )}
      {meta && totalPages <= 1 && items.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground" data-testid="page-info">
          {meta.total} file{meta.total === 1 ? "" : "s"}
        </p>
      )}

      <MediaDetailDrawer
        id={search.asset}
        onClose={() => setSearch({ asset: undefined }, { keepPage: true })}
      />
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => void list.refetch().then(() => stats.refetch())}
      />
      <HealthDialog open={healthOpen} onOpenChange={setHealthOpen} />
      <ConfirmDialog
        open={bulkConfirm}
        onOpenChange={setBulkConfirm}
        title={`Delete ${selected.size} selected file${selected.size === 1 ? "" : "s"}?`}
        description="Unattached files are removed from storage and cannot be recovered. Anything that is in use is skipped."
        onConfirm={runBulk}
      />
    </div>
  );
}
