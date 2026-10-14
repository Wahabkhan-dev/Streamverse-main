import { ArrowDown, ArrowUp, BookOpen, Film, Headphones, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ItemRef, ItemType } from "@/lib/data";
import { itemTitle, refOf, typeLabel, useCatalog, type Item } from "@/lib/items";
import { cn } from "@/lib/utils";
import { Btn, StatusBadge, useRovingTabs } from "./ui";
import { DragHandle, useReorder } from "./wizard/kit";

const Icon = { Movie: Film, eBook: BookOpen, Audiobook: Headphones } as const;
const keyOf = (r: ItemRef) => `${r.type}:${r.slug}`;

/**
 * A modal for choosing and ordering titles (movies, eBooks, audiobooks): search, select, remove, reorder.
 * Used by the homepage sections and by collections.
 */
export function ContentPicker({ open, onOpenChange, title, description, initial, onSave, types = ["Movie", "eBook", "Audiobook"] }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; initial: ItemRef[]; onSave: (refs: ItemRef[]) => void; types?: ItemType[] }) {
  const cat = useCatalog();
  const [tab, setTab] = useState<ItemType>(types[0]!);
  const tabProps = useRovingTabs(types.length);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<ItemRef[]>(initial);
  useEffect(() => {
    if (open) {
      setPicked(initial);
      setQ("");
      setTab(types[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reorder = useReorder(picked, setPicked);
  const chosen = new Set(picked.map(keyOf));
  const available = useMemo(
    () => cat.all.filter((i) => i.type === tab && itemTitle(i).toLowerCase().includes(q.trim().toLowerCase())),
    [cat.all, tab, q],
  );
  const add = (i: Item) => setPicked((p) => (chosen.has(keyOf(i)) ? p : [...p, refOf(i)]));
  const titleOf = (r: ItemRef) => {
    const it = cat.resolve(r);
    return it ? itemTitle(it) : "Unavailable content";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] border-border bg-surface-2 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? "Search, pick titles and drag to set the order."}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 md:grid-cols-2">
          <section aria-label="Available titles" className="flex min-h-0 flex-col rounded-lg border border-border bg-surface">
            <div className="flex gap-1 border-b border-border p-2" role="tablist" aria-label="Content type">
              {types.map((t, i) => {
                const I = Icon[t];
                return (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} {...tabProps(i, tab === t, (to) => setTab(types[to]!))} onClick={() => setTab(t)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold", tab === t ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <I className="size-3.5" /> {typeLabel(t)}
                  </button>
                );
              })}
            </div>
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${typeLabel(tab).toLowerCase()}...`} aria-label="Search titles" className="h-9 w-full rounded-md border border-input bg-surface-2 pr-3 pl-9 text-sm focus:border-primary focus:outline-none" />
            </div>
            <ul className="max-h-72 min-h-40 flex-1 overflow-auto">
              {available.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No titles found.</li>}
              {available.map((i) => {
                const on = chosen.has(keyOf(i));
                const status = i.type === "Movie" ? i.m.status : i.b.status;
                return (
                  <li key={keyOf(i)} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm">{itemTitle(i)}</span>
                    {status !== "Published" && <StatusBadge status={status} />}
                    <Btn size="sm" variant={on ? "ghost" : "outline"} disabled={on} onClick={() => add(i)} aria-label={`Add ${itemTitle(i)}`}>
                      <Plus /> {on ? "Added" : "Add"}
                    </Btn>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Selected titles" className="flex min-h-0 flex-col rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-bold">
              Selected <span className="text-xs font-normal text-muted-foreground">{picked.length}</span>
            </div>
            <ol className="max-h-72 min-h-40 flex-1 overflow-auto">
              {picked.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nothing selected yet. Add titles from the left.</li>}
              {picked.map((r, i) => {
                const rd = reorder(i);
                const I = Icon[r.type];
                return (
                  <li key={keyOf(r)} {...rd.row} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0">
                    <DragHandle {...rd.handle} />
                    <span className="w-5 text-xs font-bold text-muted-foreground">{i + 1}</span>
                    <I className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{titleOf(r)}</span>
                    <button type="button" aria-label={`Move ${titleOf(r)} up`} disabled={i === 0} onClick={() => rd.move(-1)} className="grid size-7 place-items-center rounded text-soft hover:bg-surface-3 disabled:opacity-30">
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" aria-label={`Move ${titleOf(r)} down`} disabled={i === picked.length - 1} onClick={() => rd.move(1)} className="grid size-7 place-items-center rounded text-soft hover:bg-surface-3 disabled:opacity-30">
                      <ArrowDown className="size-4" />
                    </button>
                    <button type="button" aria-label={`Remove ${titleOf(r)}`} onClick={() => setPicked((p) => p.filter((x) => keyOf(x) !== keyOf(r)))} className="grid size-7 place-items-center rounded text-soft hover:bg-primary/10 hover:text-primary-text">
                      <X className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
        <div className="flex justify-end gap-2">
          <Btn onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn
            variant="primary"
            onClick={() => {
              onSave(picked);
              onOpenChange(false);
            }}
          >
            Save selection
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}
