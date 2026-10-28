import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { adminGenresApi } from "@/api/admin.api";
import { isApiError } from "@/api/client";
import type { ApiContentKind, ApiGenre } from "@/api/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminGenresQuery } from "@/hooks/useAdminApi";
import { GENRES_QUERY_KEY } from "@/hooks/useGenreNames";
import { cn } from "@/lib/utils";
import { Btn, ConfirmDialog, EmptyState, Field, PageHeader, Panel, Skel, Tag, TextArea, TextInput, Toggle } from "./ui";

const KINDS: Array<{ value: ApiContentKind | ""; label: string; short: string }> = [
  { value: "", label: "All kinds of titles", short: "All" },
  { value: "MOVIE", label: "Movies", short: "Movie" },
  { value: "EBOOK", label: "eBooks", short: "eBook" },
  { value: "AUDIOBOOK", label: "Audiobooks", short: "Audiobook" },
];
const scopeLabel = (g: ApiGenre) => KINDS.find((k) => k.value === (g.contentType ?? ""))!.short;
const message = (e: unknown) => (isApiError(e) ? e.message : "Something went wrong. Please try again.");

interface Draft {
  id?: string;
  name: string;
  description: string;
  contentType: ApiContentKind | "";
  active: boolean;
}
const blank: Draft = { name: "", description: "", contentType: "", active: true };

/** Genres & categories in live mode: every change is saved on the server and shows up in the wizards and customer filters at once. */
export function LiveGenres() {
  const qc = useQueryClient();
  const list = useAdminGenresQuery();
  const genres: ApiGenre[] = list.data?.data ?? [];
  const [filter, setFilter] = useState<"All" | "Movie" | "eBook" | "Audiobook">("All");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [del, setDel] = useState<ApiGenre | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "genres"] });
    void qc.invalidateQueries({ queryKey: GENRES_QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: (d: Draft) =>
      d.id
        ? adminGenresApi.update(d.id, { name: d.name.trim(), description: d.description.trim() || null, contentType: d.contentType || null, active: d.active })
        : adminGenresApi.create({ name: d.name.trim(), ...(d.description.trim() ? { description: d.description.trim() } : {}), ...(d.contentType ? { contentType: d.contentType } : {}), active: d.active }),
    onSuccess: (_r, d) => {
      toast.success(d.id ? "Genre saved" : "Genre added");
      setDraft(null);
      refresh();
    },
    onError: (e) => toast.error(message(e)),
  });

  const remove = useMutation({
    mutationFn: (g: ApiGenre) => adminGenresApi.delete(g.id),
    onSuccess: (_r, g) => {
      toast.success(`${g.name} removed`);
      refresh();
    },
    // the server refuses while titles still use it and says how many
    onError: (e) => toast.error(message(e)),
  });

  const visible = genres.filter((g) => filter === "All" || !g.contentType || scopeLabel(g) === filter);
  const count = (kind: ApiContentKind) => genres.filter((g) => g.active && (!g.contentType || g.contentType === kind)).length;

  const submit = () => {
    if (!draft) return;
    if (!draft.name.trim()) return void toast.warning("Enter a genre name");
    if (genres.some((g) => g.id !== draft.id && g.name.trim().toLowerCase() === draft.name.trim().toLowerCase())) return void toast.warning("That genre already exists");
    save.mutate(draft);
  };

  return (
    <>
      <PageHeader
        title="Genres & categories"
        sub="Add the genres and categories your titles can use. They appear in the wizards and in customers' filters straight away."
        actions={
          <Btn variant="primary" onClick={() => setDraft(blank)} data-testid="add-genre">
            <Plus /> Add genre
          </Btn>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Panel>
          <div className="flex gap-1 border-b border-border p-2">
            {(["All", "Movie", "eBook", "Audiobook"] as const).map((x) => (
              <button key={x} onClick={() => setFilter(x)} className={cn("h-8 rounded-md px-3 text-xs font-semibold", filter === x ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {x}
              </button>
            ))}
          </div>
          {list.isLoading ? (
            <div className="space-y-2 p-4">
              <Skel className="h-12" />
              <Skel className="h-12" />
            </div>
          ) : list.isError ? (
            <EmptyState title="Genres could not be loaded" action={<Btn onClick={() => void list.refetch()}>Try again</Btn>} />
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No genres here yet. Use Add genre to create the first one.</div>
          ) : (
            visible.map((g) => (
              <div key={g.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0 hover:bg-surface-2" data-testid="genre-row">
                <span className="grid size-8 place-items-center rounded-md bg-surface-3 text-soft">
                  <ListTree className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.contentType ? scopeLabel(g) : "Available to all content"} · {g.usage ?? 0} title{g.usage === 1 ? "" : "s"}
                  </div>
                </div>
                {!g.active && <Tag>Hidden</Tag>}
                <Tag>{scopeLabel(g)}</Tag>
                <button className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label={`Edit ${g.name}`} onClick={() => setDraft({ id: g.id, name: g.name, description: g.description ?? "", contentType: g.contentType ?? "", active: g.active })}>
                  <Pencil className="size-4" />
                </button>
                <button className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text" aria-label={`Delete ${g.name}`} onClick={() => ((g.usage ?? 0) > 0 ? toast.warning(`${g.name} is used by ${g.usage} title${g.usage === 1 ? "" : "s"}`, { description: "Change those titles to another genre first, or hide this genre instead." }) : setDel(g))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </Panel>
        <Panel className="h-fit p-5">
          <h2 className="font-bold">Catalog taxonomy</h2>
          <p className="mt-1 text-sm text-muted-foreground">Genres are shared by the wizards and by every discovery filter. Audiobooks use the eBook categories.</p>
          {(
            [
              ["Movies", count("MOVIE")],
              ["eBooks", count("EBOOK")],
              ["Audiobooks", count("AUDIOBOOK")],
            ] as const
          ).map(([a, b]) => (
            <div key={a} className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">{a}</span>
              <b>{b}</b>
            </div>
          ))}
        </Panel>
      </div>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="border-border bg-surface-2">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit genre" : "Add a genre"}</DialogTitle>
            <DialogDescription>Choose what kind of titles it applies to. A genre for all kinds shows up everywhere.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <Field label="Genre name" required>
                <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} data-testid="genre-name" />
              </Field>
              <Field label="Applies to">
                <select className="w-full rounded-md border border-border bg-surface-3 px-3 py-2 text-sm" aria-label="Applies to" value={draft.contentType} onChange={(e) => setDraft({ ...draft, contentType: e.target.value as Draft["contentType"] })} data-testid="genre-kind">
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Description">
                <TextArea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
              <Toggle checked={draft.active} label="Available to pick and to filter by" onChange={(v) => setDraft({ ...draft, active: v })} />
              <div className="flex justify-end gap-2">
                <Btn onClick={() => setDraft(null)}>Cancel</Btn>
                <Btn variant="primary" onClick={submit} disabled={save.isPending} data-testid="save-genre">
                  {save.isPending ? "Saving…" : "Save genre"}
                </Btn>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete genre?"
        description={del ? `"${del.name}" will be removed. Titles do not use it, so nothing is left without a genre.` : ""}
        onConfirm={() => {
          if (del) remove.mutate(del);
          setDel(null);
        }}
      />
    </>
  );
}
