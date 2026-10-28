import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, isApiError } from "@/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInvalidateMedia, useMediaDetailQuery } from "@/hooks/useMediaLibrary";
import { ArtworkField } from "./media/ArtworkField";
import { ARTWORK_SLOTS } from "./media/MediaPicker";
import {
  Btn,
  ConfirmDialog,
  EmptyState,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  Skel,
  StatusBadge,
  Tag,
  TextArea,
  TextInput,
  Toggle,
  inputCls,
} from "./ui";

type Row = Record<string, unknown>;
const unwrap = <T,>(r: { data: T }) => r.data;

/** A small signed preview for a row, fetched through the library's detail endpoint (a handful of rows, so a handful of requests). */
function RowThumb({ assetId }: { assetId: unknown }) {
  const d = useMediaDetailQuery(typeof assetId === "string" ? assetId : undefined).data?.data;
  return (
    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-surface-3">
      {d?.previewUrl ? (
        <img
          src={d.previewUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="grid size-full place-items-center text-[10px] text-muted-foreground">
          No image
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- banners */

const BANNER_WHERE: Record<string, string> = {
  HERO: "Big banner at the top of the Movies, eBooks or Audiobooks page (you choose which). The HOMEPAGE hero is managed in Admin > Homepage, not here. Picture: 1920 x 800 or larger.",
  NORMAL: "Wide banner between the rows of the homepage. Picture: 1200 x 400 or larger.",
  LATEST_RELEASE:
    "Spotlight card for a new release on the homepage. Picture: 1200 x 400 or larger.",
  PROMOTIONAL: "Slim campaign strip on the homepage. Picture: 1200 x 400 or larger.",
};

const BANNER_TYPES: Array<[string, string]> = [
  ["HERO", "Hero banner"],
  ["NORMAL", "Normal banner"],
  ["LATEST_RELEASE", "Latest release banner"],
  ["PROMOTIONAL", "Promotional banner"],
];

interface BannerForm {
  id?: string;
  type: string;
  title: string;
  description: string;
  buttonText: string;
  priority: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  /** string = chosen, null = remove the saved one, undefined = none */
  /** title this banner opens when clicked; null = remove the saved link */
  linkedContentId: string | null | undefined;
  /** hero banners only: the sub-page they lead */
  placement: string;
  /** the banner itself decides to appear on the customer homepage */
  showOnHomepage: boolean;
  /** "top", the key of the homepage section it follows, or "" for the bottom */
  homepageAfter: string;
  /** what the button opens */
  linkKind: "none" | "subscription" | "title";
  desktopAssetId: string | null | undefined;
  mobileAssetId: string | null | undefined;
}
const blankBanner = (): BannerForm => ({
  type: "HERO",
  title: "",
  description: "",
  buttonText: "Watch Now",
  priority: "1",
  startsAt: "",
  endsAt: "",
  active: true,
  linkedContentId: undefined,
  placement: "MOVIES",
  showOnHomepage: false,
  homepageAfter: "",
  linkKind: "none",
  desktopAssetId: undefined,
  mobileAssetId: undefined,
});

/** Published titles a banner can open. */
function useLinkTargets() {
  return useQuery({
    queryKey: ["admin", "banner-link-targets"],
    staleTime: 60_000,
    queryFn: async () => {
      const kinds: Array<[string, string]> = [
        ["movies", "Movie"],
        ["ebooks", "eBook"],
        ["audiobooks", "Audiobook"],
      ];
      const lists = await Promise.all(
        kinds.map(async ([path, label]) =>
          unwrap(await api.get<{ data: Row[] }>(`/admin/${path}?status=PUBLISHED&limit=100`)).map(
            (r) => ({
              id: String(r["id"]),
              label: `${label}: ${String(r["title"])}`,
            }),
          ),
        ),
      );
      return lists.flat();
    },
  });
}

export function LiveBanners() {
  const qc = useQueryClient();
  const invalidateMedia = useInvalidateMedia();
  const list = useQuery({
    queryKey: ["admin", "banners", "live"],
    queryFn: async () => unwrap(await api.get<{ data: Row[] }>("/admin/banners?limit=100")),
  });
  const targets = useLinkTargets();
  // the homepage sections a banner can be placed after (the banner picks its own spot)
  const homeSections = useQuery({
    queryKey: ["admin", "homepage", "banner-positions"],
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(await api.get<{ data: Row[] }>("/admin/homepage/sections?limit=100"))
        .filter((r) => r["type"] !== "BANNER" && r["enabled"] !== false)
        .sort((a, b) => Number(a["displayOrder"] ?? 0) - Number(b["displayOrder"] ?? 0))
        .map((r) => ({ key: String(r["key"]), label: String(r["displayTitle"] ?? r["key"]) })),
  });
  const [form, setForm] = useState<BannerForm | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin", "banners"] });
    invalidateMedia();
  };

  const open = (b?: Row) =>
    setForm(
      b
        ? {
            id: String(b["id"]),
            type: String(b["type"] ?? "HERO"),
            title: String(b["title"] ?? ""),
            description: String(b["description"] ?? ""),
            buttonText: String(b["buttonText"] ?? ""),
            priority: String(b["priority"] ?? 1),
            startsAt: b["startsAt"] ? String(b["startsAt"]).slice(0, 10) : "",
            endsAt: b["endsAt"] ? String(b["endsAt"]).slice(0, 10) : "",
            active: b["active"] !== false,
            linkedContentId: (b["linkedContentId"] as string | null) ?? undefined,
            placement: String(b["placement"] ?? "MOVIES"),
            showOnHomepage: b["showOnHomepage"] === true,
            homepageAfter: String(b["homepageAfter"] ?? ""),
            linkKind:
              b["linkToSubscription"] === true
                ? "subscription"
                : b["linkedContentId"]
                  ? "title"
                  : "none",
            desktopAssetId: (b["desktopAssetId"] as string | null) ?? undefined,
            mobileAssetId: (b["mobileAssetId"] as string | null) ?? undefined,
          }
        : blankBanner(),
    );

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) return void toast.warning("Banner title is required.");
    setSaving(true);
    try {
      const body = {
        type: form.type,
        title: form.title.trim(),
        description: form.description,
        buttonText: form.buttonText,
        priority: Math.max(1, Number(form.priority) || 1),
        active: form.active,
        ...(form.startsAt ? { startsAt: form.startsAt } : {}),
        ...(form.endsAt ? { endsAt: form.endsAt } : {}),
        linkToSubscription: form.linkKind === "subscription",
        ...(form.type === "HERO" ? { placement: form.placement } : {}),
        showOnHomepage: form.type !== "HERO" && form.showOnHomepage,
        homepageAfter: form.type !== "HERO" && form.showOnHomepage && form.homepageAfter ? form.homepageAfter : null,
        ...(form.linkKind === "title" && form.linkedContentId
          ? { linkedContentId: form.linkedContentId }
          : form.id
            ? { linkedContentId: null }
            : {}),
        ...(form.desktopAssetId !== undefined && (form.desktopAssetId || form.id)
          ? { desktopAssetId: form.desktopAssetId }
          : {}),
        ...(form.mobileAssetId !== undefined && (form.mobileAssetId || form.id)
          ? { mobileAssetId: form.mobileAssetId }
          : {}),
      };
      if (form.id) await api.put(`/admin/banners/${form.id}`, body);
      else await api.post("/admin/banners", body);
      toast.success(form.id ? "Banner saved" : "Banner created");
      setForm(null);
      await refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not save the banner");
    } finally {
      setSaving(false);
    }
  };

  const rows = list.data ?? [];
  return (
    <div data-testid="live-banners">
      <PageHeader
        title="Banners"
        sub="Schedule the images and stories that lead the StreamVerse experience."
        actions={
          <Btn variant="primary" onClick={() => open()} data-testid="add-banner">
            <Plus /> Add banner
          </Btn>
        }
      />
      <Panel>
        <PanelHeader
          title="Placements"
          sub="Lowest priority number shows first"
          action={<span className="text-xs text-muted-foreground">{rows.length} banners</span>}
        />
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            <Skel className="h-16" />
            <Skel className="h-16" />
          </div>
        ) : list.isError ? (
          <EmptyState
            title="Banners could not be loaded"
            action={<Btn onClick={() => void list.refetch()}>Try again</Btn>}
          />
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No banners yet. Use Add banner to create the first one.
          </div>
        ) : (
          rows.map((b) => (
            <div
              key={String(b["id"])}
              className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4 last:border-0"
              data-testid="banner-row"
            >
              <RowThumb assetId={b["desktopAssetId"]} />
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{String(b["title"])}</span>
                  <Tag>{BANNER_TYPES.find(([v]) => v === b["type"])?.[1] ?? String(b["type"])}</Tag>
                  {b["showOnHomepage"] === true && <Tag>On homepage</Tag>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Priority {String(b["priority"])}
                </div>
              </div>
              <StatusBadge status={b["active"] ? "Active" : "Draft"} />
              <button
                className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3"
                aria-label={`Edit ${String(b["title"])}`}
                onClick={() => open(b)}
              >
                <Pencil className="size-4" />
              </button>
              <button
                className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text"
                aria-label={`Delete ${String(b["title"])}`}
                onClick={() => setDel(b)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </Panel>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-surface-2 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit banner" : "Add banner"}</DialogTitle>
            <DialogDescription>Pick the banner pictures from the Media Library.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <Field label="Title" required>
                <TextInput
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  data-testid="banner-title"
                />
              </Field>
              <Field label="Description">
                <TextArea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Banner type">
                  <select
                    className={inputCls}
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    aria-label="Banner type"
                  >
                    {BANNER_TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <p
                  className="text-xs text-muted-foreground sm:col-span-2"
                  data-testid="banner-where"
                >
                  {BANNER_WHERE[form.type]}
                </p>
                {form.type === "HERO" && (
                  <Field label="Show on page" required>
                    <select
                      className={inputCls}
                      aria-label="Show on page"
                      data-testid="banner-placement"
                      value={form.placement}
                      onChange={(e) => setForm({ ...form, placement: e.target.value })}
                    >
                      <option value="MOVIES">Movies page</option>
                      <option value="EBOOKS">eBooks page</option>
                      <option value="AUDIOBOOKS">Audiobooks page</option>
                    </select>
                  </Field>
                )}
                {form.type !== "HERO" && (
                  <div className="space-y-3 rounded-md border border-border p-3 sm:col-span-2" data-testid="banner-homepage">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={form.showOnHomepage}
                        onChange={(e) => setForm({ ...form, showOnHomepage: e.target.checked })}
                        data-testid="banner-show-home"
                      />
                      Show this banner on the homepage
                    </label>
                    {form.showOnHomepage && (
                      <Field label="Where on the homepage">
                        <select
                          className={inputCls}
                          aria-label="Where on the homepage"
                          data-testid="banner-home-after"
                          value={form.homepageAfter}
                          onChange={(e) => setForm({ ...form, homepageAfter: e.target.value })}
                        >
                          <option value="top">At the very top</option>
                          {(homeSections.data ?? []).map((s) => (
                            <option key={s.key} value={s.key}>
                              After: {s.label}
                            </option>
                          ))}
                          <option value="">At the very bottom</option>
                        </select>
                      </Field>
                    )}
                  </div>
                )}
                <Field label="Button opens">
                  <select
                    className={inputCls}
                    aria-label="Button opens"
                    data-testid="banner-link-kind"
                    value={form.linkKind}
                    onChange={(e) =>
                      setForm({ ...form, linkKind: e.target.value as BannerForm["linkKind"] })
                    }
                  >
                    <option value="none">Nothing (picture only)</option>
                    <option value="subscription">Subscription page</option>
                    <option value="title">A movie, eBook or audiobook</option>
                  </select>
                </Field>
                {form.linkKind === "title" && (
                  <Field label="Which title">
                    <select
                      className={inputCls}
                      aria-label="Linked title"
                      data-testid="banner-link-title"
                      value={form.linkedContentId ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, linkedContentId: e.target.value || null })
                      }
                    >
                      <option value="">Choose a title…</option>
                      {(targets.data ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Button text">
                  <TextInput
                    value={form.buttonText}
                    onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                  />
                </Field>
                <Field label="Start date">
                  <TextInput
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  />
                </Field>
                <Field label="End date">
                  <TextInput
                    type="date"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  />
                </Field>
                <Field label="Priority" hint="1 shows first">
                  <TextInput
                    type="number"
                    min={1}
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ArtworkField
                  slot={
                    form.type === "HERO"
                      ? {
                          ...ARTWORK_SLOTS.bannerDesktop,
                          label: "Hero banner image",
                          types: ["HERO_BANNER", "NORMAL_BANNER", "LATEST_RELEASE_BANNER"],
                          minWidth: 1920,
                          minHeight: 800,
                        }
                      : ARTWORK_SLOTS.bannerDesktop
                  }
                  assetId={form.desktopAssetId}
                  onChange={(id) => setForm((f) => (f ? { ...f, desktopAssetId: id } : f))}
                  onRemove={() => setForm((f) => (f ? { ...f, desktopAssetId: null } : f))}
                />
                <ArtworkField
                  slot={ARTWORK_SLOTS.bannerMobile}
                  assetId={form.mobileAssetId}
                  onChange={(id) => setForm((f) => (f ? { ...f, mobileAssetId: id } : f))}
                  onRemove={() => setForm((f) => (f ? { ...f, mobileAssetId: null } : f))}
                />
              </div>
              <Toggle
                checked={form.active}
                onChange={(v) => setForm({ ...form, active: v })}
                label="Active"
              />
              <div className="flex justify-end gap-2">
                <Btn onClick={() => setForm(null)}>Cancel</Btn>
                <Btn
                  variant="primary"
                  disabled={saving}
                  onClick={() => void save()}
                  data-testid="save-banner"
                >
                  {saving ? "Saving…" : "Save banner"}
                </Btn>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete this banner?"
        description="It will stop showing on the customer site immediately. Its pictures stay in the Media Library."
        onConfirm={() => {
          if (!del) return;
          api
            .delete(`/admin/banners/${String(del["id"])}`)
            .then(() => {
              toast.success("Banner deleted");
              return refresh();
            })
            .catch((e) => toast.error(isApiError(e) ? e.message : "Delete failed"));
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ collections */

interface CollectionForm {
  id?: string;
  name: string;
  description: string;
  status: string;
  bannerAssetId: string | null | undefined;
}

export function LiveCollections() {
  const qc = useQueryClient();
  const invalidateMedia = useInvalidateMedia();
  const list = useQuery({
    queryKey: ["admin", "collections", "live"],
    queryFn: async () => unwrap(await api.get<{ data: Row[] }>("/admin/collections?limit=100")),
  });
  const [form, setForm] = useState<CollectionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin", "collections"] });
    invalidateMedia();
  };
  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return void toast.warning("Collection name is required.");
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description,
        ...(form.bannerAssetId !== undefined && (form.bannerAssetId || form.id)
          ? { bannerAssetId: form.bannerAssetId }
          : {}),
        ...(form.id ? { status: form.status } : {}),
      };
      if (form.id) await api.put(`/admin/collections/${form.id}`, body);
      else await api.post("/admin/collections", body);
      toast.success(form.id ? "Collection saved" : "Collection created");
      setForm(null);
      await refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not save the collection");
    } finally {
      setSaving(false);
    }
  };
  const rows = list.data ?? [];
  return (
    <div data-testid="live-collections">
      <PageHeader
        title="Collections"
        sub="Group titles into rows and landing pages."
        actions={
          <Btn
            variant="primary"
            onClick={() =>
              setForm({ name: "", description: "", status: "DRAFT", bannerAssetId: undefined })
            }
            data-testid="add-collection"
          >
            <Plus /> New collection
          </Btn>
        }
      />
      <Panel>
        <PanelHeader
          title="All collections"
          action={<span className="text-xs text-muted-foreground">{rows.length}</span>}
        />
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            <Skel className="h-16" />
            <Skel className="h-16" />
          </div>
        ) : list.isError ? (
          <EmptyState
            title="Collections could not be loaded"
            action={<Btn onClick={() => void list.refetch()}>Try again</Btn>}
          />
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No collections yet.</div>
        ) : (
          rows.map((c) => (
            <div
              key={String(c["id"])}
              className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4 last:border-0"
              data-testid="collection-row"
            >
              <RowThumb assetId={c["bannerAssetId"]} />
              <div className="min-w-0 flex-1 basis-56">
                <div className="truncate text-sm font-semibold">{String(c["name"])}</div>
                <div className="text-xs text-muted-foreground">/{String(c["slug"])}</div>
              </div>
              <StatusBadge status={String(c["status"]) === "PUBLISHED" ? "Published" : "Draft"} />
              <button
                className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3"
                aria-label={`Edit ${String(c["name"])}`}
                onClick={() =>
                  setForm({
                    id: String(c["id"]),
                    name: String(c["name"]),
                    description: String(c["description"] ?? ""),
                    status: String(c["status"] ?? "DRAFT"),
                    bannerAssetId: (c["bannerAssetId"] as string | null) ?? undefined,
                  })
                }
              >
                <Pencil className="size-4" />
              </button>
            </div>
          ))
        )}
      </Panel>
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-surface-2 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit collection" : "New collection"}</DialogTitle>
            <DialogDescription>
              The collection image comes from the Media Library.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <Field label="Name" required>
                <TextInput
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="collection-name"
                />
              </Field>
              <Field label="Description">
                <TextArea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              {form.id && (
                <Field label="Status">
                  <select
                    className={inputCls}
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    aria-label="Status"
                  >
                    {["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"].map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <ArtworkField
                slot={ARTWORK_SLOTS.collectionImage}
                assetId={form.bannerAssetId}
                onChange={(id) => setForm((f) => (f ? { ...f, bannerAssetId: id } : f))}
                onRemove={() => setForm((f) => (f ? { ...f, bannerAssetId: null } : f))}
              />
              <div className="flex justify-end gap-2">
                <Btn onClick={() => setForm(null)}>Cancel</Btn>
                <Btn
                  variant="primary"
                  disabled={saving}
                  onClick={() => void save()}
                  data-testid="save-collection"
                >
                  {saving ? "Saving…" : "Save collection"}
                </Btn>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
