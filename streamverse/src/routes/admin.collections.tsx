import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, ImagePlus, Layers, ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ContentPicker } from "@/components/sv/ContentPicker";
import { Btn, ConfirmDialog, EmptyState, Field, PageHeader, Skel, StatusBadge, TextArea, TextInput } from "@/components/sv/ui";
import { DragHandle, useReorder } from "@/components/sv/wizard/kit";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ItemRef } from "@/lib/data";
import { itemTitle, useCatalog } from "@/lib/items";
import { PLACEHOLDER_IMAGE } from "@/lib/placeholder";
import { slugify, update, useCollections, type Collection } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useAdminCollectionsQuery, useAdminCollectionMutation } from "@/hooks/useAdminApi";

export const Route = createFileRoute("/admin/collections")({
  validateSearch: (s: Record<string, unknown>): { edit?: string } => (typeof s["edit"] === "string" && s["edit"] ? { edit: s["edit"] } : {}),
  component: CollectionsAdmin,
});

const MAX_IMAGE = 1_500_000;
const readFile = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

function CollectionsAdmin() {
  const demoCollections = useCollections();
  const apiQuery = useAdminCollectionsQuery();
  const apiMutation = useAdminCollectionMutation();
  const isLoading = !DEMO_MODE && apiQuery.isLoading;
  const isError = !DEMO_MODE && apiQuery.isError;

  const apiCollections: Collection[] = useMemo(() => {
    return (apiQuery.data?.data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description ?? "",
      cover: c.cover ?? PLACEHOLDER_IMAGE,
      status: c.status,
      items: c.items.map((it) => ({ type: it.contentType === "movie" ? "Movie" : it.contentType === "ebook" ? "eBook" : "Audiobook", slug: it.movie?.slug ?? it.ebook?.slug ?? it.audiobook?.slug ?? "" } as ItemRef)),
    }));
  }, [apiQuery.data]);

  const collections: Collection[] = DEMO_MODE ? demoCollections : apiCollections;
  const cat = useCatalog();
  const { edit } = Route.useSearch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Collection>({ id: "", slug: "", name: "", description: "", cover: "", items: [], status: "Draft" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);
  const [del, setDel] = useState<Collection | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const fallbackCover = PLACEHOLDER_IMAGE;

  const begin = (c?: Collection) => {
    setErrors({});
    setEditingId(c?.id ?? null);
    setDraft(c ?? { id: "", slug: "", name: "", description: "", cover: "", items: [], status: "Draft" });
    setOpen(true);
  };
  // a link such as /admin/collections?edit=<id> (from admin search) opens that collection
  useEffect(() => {
    if (!edit) return;
    const c = collections.find((x) => x.id === edit);
    if (c) begin(c);
    navigate({ to: "/admin/collections", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit]);

  const reorder = useReorder(draft.items, (items) => setDraft((d) => ({ ...d, items })));
  const titleOf = (r: ItemRef) => {
    const it = cat.resolve(r);
    return it ? itemTitle(it) : "Unavailable content";
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e["name"] = "Collection name is required.";
    setErrors(e);
    if (Object.keys(e).length) return void toast.warning("Please fix the highlighted fields.");
    const taken = collections.filter((c) => c.id !== editingId).map((c) => c.slug);
    let slug = draft.slug || slugify(draft.name) || "collection";
    for (let n = 2; taken.includes(slug); n++) slug = `${slugify(draft.name)}-${n}`;
    const saved: Collection = { ...draft, name: draft.name.trim(), description: draft.description.trim(), slug, id: editingId ?? slug, cover: draft.cover || (draft.items[0] ? (cat.resolve(draft.items[0])?.type === "Movie" ? (cat.movies.find((m) => m.slug === draft.items[0]!.slug)?.image ?? fallbackCover) : fallbackCover) : fallbackCover) };
    if (DEMO_MODE) {
      update((s) => ({ collections: editingId ? s.collections.map((c) => (c.id === editingId ? saved : c)) : [saved, ...s.collections] }));
      setOpen(false);
      toast.success(`${saved.name} saved`);
    } else {
      const apiData = { name: saved.name, description: saved.description, cover: saved.cover, status: saved.status };
      if (editingId) {
        apiMutation.update.mutate({ id: editingId, data: apiData }, { onSuccess: () => { setOpen(false); toast.success(`${saved.name} saved`); } });
      } else {
        apiMutation.create.mutate(apiData, { onSuccess: () => { setOpen(false); toast.success(`${saved.name} created`); } });
      }
    }
  };
  const setStatus = (c: Collection, status: Collection["status"]) => {
    if (DEMO_MODE) {
      update((s) => ({ collections: s.collections.map((x) => (x.id === c.id ? { ...x, status } : x)) }));
      toast.success(`${c.name} ${status === "Published" ? "published" : "unpublished"}`);
    } else {
      apiMutation.update.mutate({ id: c.id, data: { status } }, { onSuccess: () => toast.success(`${c.name} ${status === "Published" ? "published" : "unpublished"}`) });
    }
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skel className="h-8 w-64" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skel key={i} className="h-48 w-full" />)}</div></div>;
  if (isError) return <div className="p-8 text-center text-sm text-muted-foreground">Failed to load collections.</div>;

  return (
    <>
      <PageHeader
        title="Collections"
        sub="Hand-picked groups of movies, eBooks and audiobooks, shown on the homepage and at /collections."
        actions={
          <Btn variant="primary" onClick={() => begin()}>
            <Plus /> New collection
          </Btn>
        }
      />
      {collections.length === 0 ? (
        <EmptyState icon={Layers} title="No collections yet" sub="Create a collection to group titles, then publish it to show it to customers." action={<Btn variant="primary" onClick={() => begin()}><Plus /> New collection</Btn>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="relative aspect-[16/7] bg-surface-2">
                <img src={c.cover} alt="" className="size-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{c.name}</div>
                    <div className="text-xs text-soft">{c.items.length} {c.items.length === 1 ? "title" : "titles"}</div>
                  </div>
                  <StatusBadge status={c.status === "Published" ? "Published" : "Draft"} />
                </div>
              </div>
              <p className="line-clamp-2 min-h-10 px-4 pt-3 text-xs text-muted-foreground">{c.description || "No description."}</p>
              <div className="flex flex-wrap gap-1 p-3">
                <Btn size="sm" onClick={() => begin(c)}>
                  <Pencil /> Edit
                </Btn>
                <Btn size="sm" onClick={() => setStatus(c, c.status === "Published" ? "Draft" : "Published")}>
                  {c.status === "Published" ? <EyeOff /> : <Eye />} {c.status === "Published" ? "Unpublish" : "Publish"}
                </Btn>
                {c.status === "Published" && (
                  <Link to="/collections/$slug" params={{ slug: c.slug }} className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-soft hover:bg-surface-3 [&_svg]:size-4">
                    <ExternalLink /> View
                  </Link>
                )}
                <Btn size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setDel(c)} className="ml-auto">
                  <Trash2 />
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-surface-2 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit collection" : "New collection"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Field label="Collection Name" required>
                <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Award Winners" aria-invalid={!!errors["name"]} />
              </Field>
              {errors["name"] && <p role="alert" className="mt-1 text-[11px] font-medium text-primary-text">{errors["name"]}</p>}
            </div>
            <Field label="Description">
              <TextArea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-soft">Cover / Banner</span>
                <span className="text-muted-foreground">1600 × 1000 recommended</span>
              </div>
              <div className="relative aspect-[16/6] overflow-hidden rounded-md border border-border bg-surface-2">
                {draft.cover ? <img src={draft.cover} alt="Cover preview" className="absolute inset-0 size-full object-cover" /> : <div className="grid size-full place-items-center text-xs text-muted-foreground">Uses the first title's artwork</div>}
              </div>
              <input
                ref={file}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                aria-label="Collection cover file"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (!/\.(jpe?g|png|webp)$/i.test(f.name)) return void toast.warning("Use a JPG, PNG or WebP image.");
                  if (f.size > MAX_IMAGE) return void toast.warning("That image is over 1.5 MB, so it can't be saved here.");
                  const url = await readFile(f);
                  setDraft((d) => ({ ...d, cover: url }));
                }}
              />
              <div className="mt-2 flex gap-2">
                <Btn type="button" size="sm" onClick={() => file.current?.click()}>
                  <ImagePlus /> {draft.cover ? "Replace" : "Upload"}
                </Btn>
                {draft.cover && (
                  <Btn type="button" size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, cover: "" }))}>
                    <X /> Remove
                  </Btn>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-bold">Content items <span className="font-normal text-muted-foreground">· {draft.items.length}</span></span>
                <Btn type="button" size="sm" onClick={() => setPicker(true)}>
                  <ListPlus /> Select Content
                </Btn>
              </div>
              <ol className="max-h-56 overflow-auto">
                {draft.items.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No titles yet.</li>}
                {draft.items.map((r, i) => {
                  const rd = reorder(i);
                  return (
                    <li key={`${r.type}:${r.slug}`} {...rd.row} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0">
                      <DragHandle {...rd.handle} />
                      <span className="w-5 text-xs font-bold text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{titleOf(r)}</span>
                      <span className="text-[11px] text-muted-foreground">{r.type}</span>
                      <button type="button" aria-label={`Move ${titleOf(r)} up`} disabled={i === 0} onClick={() => rd.move(-1)} className="grid size-7 place-items-center rounded text-soft hover:bg-surface-3 disabled:opacity-30">
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" aria-label={`Move ${titleOf(r)} down`} disabled={i === draft.items.length - 1} onClick={() => rd.move(1)} className="grid size-7 place-items-center rounded text-soft hover:bg-surface-3 disabled:opacity-30">
                        <ArrowDown className="size-4" />
                      </button>
                      <button type="button" aria-label={`Remove ${titleOf(r)}`} onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((x) => !(x.type === r.type && x.slug === r.slug)) }))} className="grid size-7 place-items-center rounded text-soft hover:bg-primary/10 hover:text-primary-text">
                        <X className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <Field label="Status">
              <div role="radiogroup" aria-label="Status" className="flex gap-2">
                {(["Published", "Draft"] as const).map((s) => (
                  <label key={s} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${draft.status === s ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>
                    <input type="radio" name="collection-status" className="accent-[var(--primary)]" checked={draft.status === s} onChange={() => setDraft({ ...draft, status: s })} />
                    {s}
                  </label>
                ))}
              </div>
            </Field>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={save}>
                Save collection
              </Btn>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ContentPicker open={picker} onOpenChange={setPicker} title="Select content" description="Add movies, eBooks and audiobooks to this collection, then drag to reorder." initial={draft.items} onSave={(items) => setDraft((d) => ({ ...d, items }))} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete "${del?.name}"?`}
        description="The collection will disappear from the site. The titles inside it are not deleted."
        onConfirm={() => {
          if (DEMO_MODE) {
            update((s) => ({ collections: s.collections.filter((c) => c.id !== del?.id) }));
            toast.success("Collection deleted");
          } else if (del?.id) {
            apiMutation.remove.mutate(del.id, { onSuccess: () => toast.success("Collection deleted") });
          }
        }}
      />
    </>
  );
}
