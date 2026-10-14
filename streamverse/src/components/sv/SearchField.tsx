import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Clock, Film, Headphones, Search, Tag, User, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { itemTitle, useCatalog, type Item } from "@/lib/items";
import { detailTarget } from "@/lib/links";
import { peopleOf, suggest } from "@/lib/search";
import { useGenres } from "@/lib/store";
import { addRecentSearch, clearRecentSearches, useRecentSearches } from "@/lib/user";
import { cn } from "@/lib/utils";

const TypeGlyph = ({ item }: { item: Item }) => {
  const I = item.type === "Movie" ? Film : item.type === "eBook" ? BookOpen : Headphones;
  return <I className="size-4 shrink-0 text-muted-foreground" />;
};

/**
 * The global search box. Typing shows suggestions (titles, people, genres); an empty focused box shows
 * recent searches. Enter opens the full results page.
 */
export function SearchField({ value, onChange, onSubmit, className, inputClassName, autoFocus, id = "global-search", label = "Search movies, books, audiobooks" }: { value: string; onChange: (v: string) => void; onSubmit?: (q: string) => void; className?: string; inputClassName?: string; autoFocus?: boolean; id?: string; label?: string }) {
  const navigate = useNavigate();
  const cat = useCatalog();
  const genres = useGenres();
  const recent = useRecentSearches();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number>(undefined);
  const people = useMemo(() => peopleOf(cat.listed), [cat.listed]);
  const sug = useMemo(() => suggest(cat.listed, people, genres.map((g) => g.name), value), [cat.listed, people, genres, value]);
  const hasSug = sug.titles.length + sug.people.length + sug.genres.length > 0;

  const go = (q: string) => {
    const t = q.trim();
    if (!t) return;
    addRecentSearch(t);
    setOpen(false);
    if (onSubmit) onSubmit(t);
    else navigate({ to: "/search", search: { q: t } });
  };

  return (
    <div className={cn("relative", className)} onFocus={() => { window.clearTimeout(closeTimer.current); setOpen(true); }} onBlur={() => { closeTimer.current = window.setTimeout(() => setOpen(false), 120); }}>
      <form
        role="search"
        aria-label={`${label} form`}
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search movies, books, audiobooks..."
          aria-label={label}
          className={cn("h-9 w-full rounded-md border border-border bg-surface-2 pr-9 pl-9 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none [&::-webkit-search-cancel-button]:hidden", inputClassName)}
        />
        {value && (
          <button type="button" aria-label="Clear text" onClick={() => onChange("")} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-surface-3 hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </form>
      {open && (value.trim() ? hasSug : recent.length > 0) && (
        <div role="listbox" aria-label="Search suggestions" className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-auto rounded-lg border border-border bg-surface-2 py-1 shadow-card">
          {!value.trim() ? (
            <>
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="eyebrow text-[10px] text-muted-foreground">Recent searches</span>
                <button type="button" className="text-xs font-semibold text-primary-text" onMouseDown={(e) => e.preventDefault()} onClick={clearRecentSearches}>
                  Clear
                </button>
              </div>
              {recent.map((r) => (
                <button key={r} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(r); go(r); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-3">
                  <Clock className="size-4 text-muted-foreground" /> {r}
                </button>
              ))}
            </>
          ) : (
            <>
              {sug.titles.map((i) => {
                const t = detailTarget(i.type, i.slug);
                return (
                  <button key={`${i.type}-${i.slug}`} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { addRecentSearch(value); setOpen(false); navigate({ to: t.to as "/", params: t.params as never }); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-3">
                    <TypeGlyph item={i} />
                    <span className="min-w-0 flex-1 truncate">{itemTitle(i)}</span>
                    <span className="text-[11px] text-muted-foreground">{i.type}</span>
                  </button>
                );
              })}
              {sug.people.map((p) => (
                <button key={`${p.role}-${p.name}`} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(p.name); go(p.name); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-3">
                  <User className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-[11px] text-muted-foreground">{p.role}</span>
                </button>
              ))}
              {sug.genres.map((g) => (
                <button key={g} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(g); go(g); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-3">
                  <Tag className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{g}</span>
                  <span className="text-[11px] text-muted-foreground">Genre</span>
                </button>
              ))}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(value)} className="flex w-full items-center gap-3 border-t border-border px-3 py-2 text-left text-sm font-semibold text-primary-text hover:bg-surface-3">
                <Search className="size-4" /> See all results for “{value.trim()}”
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
