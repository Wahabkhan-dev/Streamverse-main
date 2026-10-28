import { createFileRoute } from "@tanstack/react-router";
import { ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Btn, ConfirmDialog, Field, PageHeader, Panel, Skel, Tag, TextInput } from "@/components/sv/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCatalog } from "@/lib/items";
import { genreIdFor, update, useGenres, type Genre } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { LiveGenres } from "@/components/sv/LiveGenres";

// live mode: the real, server-backed screen; demo mode keeps the browser-only one below
export const Route = createFileRoute("/admin/genres")({ component: () => (DEMO_MODE ? <DemoGenres /> : <LiveGenres />) });

function DemoGenres() {
  const genres: Genre[] = useGenres();

  const cat = useCatalog();
  const usedBy = (name: string) => cat.movies.filter((m) => m.genres.includes(name)).length + [...cat.ebooks, ...cat.audiobooks].filter((b) => b.genre === name).length;
  const [filter, setFilter] = useState("All");
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const visible = genres.filter((g) => filter === "All" || g.type === filter);

  const save = () => {
    const name = (draft ?? "").trim();
    if (!name) {
      toast.warning("Enter a genre name");
      return;
    }
    if (genres.some((g) => g.name.toLowerCase() === name.toLowerCase() && g.name !== editing)) {
      toast.warning("That genre already exists");
      return;
    }
    update((s) =>
      editing
        ? {
            genres: s.genres.map((g) => (g.name === editing ? { ...g, name } : g)),
            movies: s.movies.map((m) => ({ ...m, genres: m.genres.map((x) => (x === editing ? name : x)) })),
            ebooks: s.ebooks.map((b) => (b.genre === editing ? { ...b, genre: name } : b)),
            audiobooks: s.audiobooks.map((b) => (b.genre === editing ? { ...b, genre: name } : b)),
          }
        : { genres: [...s.genres, { id: `${genreIdFor(name)}-${Date.now().toString(36)}`, name, type: filter === "All" ? "All" : filter }] },
    );
    setDraft(null);
    setEditing(null);
    toast.success("Genre saved");
  };

  const summary = [
    ["Movies", genres.filter((x) => x.type === "Movie" || x.type === "All").length],
    ["eBooks", genres.filter((x) => x.type === "eBook" || x.type === "All").length],
    ["Audiobooks", genres.filter((x) => x.type === "Audiobook" || x.type === "eBook" || x.type === "All").length],
  ] as const;

  return (
    <>
      <PageHeader
        title="Genres & categories"
        sub="Keep discovery thoughtfully organized across the catalog."
        actions={<Btn variant="primary" onClick={() => { setEditing(null); setDraft("New genre"); }}><Plus /> Add genre</Btn>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Panel>
          <div className="flex gap-1 border-b border-border p-2">
            {["All", "Movie", "eBook", "Audiobook"].map((x) => (
              <button key={x} onClick={() => setFilter(x)} className={cn("h-8 rounded-md px-3 text-xs font-semibold", filter === x ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {x}
              </button>
            ))}
          </div>
          {visible.map((g) => (
            <div key={g.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0 hover:bg-surface-2">
              <span className="grid size-8 place-items-center rounded-md bg-surface-3 text-soft">
                <ListTree className="size-4" />
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold">{g.name}</div>
                <div className="text-xs text-muted-foreground">{g.type === "All" ? "Available to all content" : g.type}</div>
              </div>
              <Tag>{g.type}</Tag>
              <button className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label={`Edit ${g.name}`} onClick={() => { setEditing(g.name); setDraft(g.name); }}>
                <Pencil className="size-4" />
              </button>
              <button className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text" aria-label={`Delete ${g.name}`} onClick={() => (usedBy(g.name) > 0 ? toast.warning(`${g.name} is used by ${usedBy(g.name)} title${usedBy(g.name) === 1 ? "" : "s"}`, { description: "Change those titles to another genre first, so nothing is left without one." }) : setDel(g.name))}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </Panel>
        <Panel className="h-fit p-5">
          <h2 className="font-bold">Catalog taxonomy</h2>
          <p className="mt-1 text-sm text-muted-foreground">Genres are shared across all discovery filters and content forms.</p>
          {summary.map(([a, b]) => (
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
            <DialogTitle>{editing ? "Edit genre" : "Add a genre"}</DialogTitle>
          </DialogHeader>
          <Field label="Genre name">
            <TextInput value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setDraft(null)}>Cancel</Btn>
            <Btn variant="primary" onClick={save}>Save genre</Btn>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete genre?"
        description={`"${del}" will be removed from the catalog taxonomy.`}
        onConfirm={() => {
          update((s) => ({ genres: s.genres.filter((g) => g.name !== del) }));
          toast.success(`${del} removed`);
        }}
      />
    </>
  );
}
