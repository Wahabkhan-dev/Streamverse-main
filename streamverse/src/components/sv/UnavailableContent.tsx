import { AlertCircle } from "lucide-react";
import type { ItemRef } from "@/lib/data";
import { refKey } from "@/lib/user";
import { Btn } from "./ui";

/**
 * Saved references whose title was deleted, unpublished or hidden. They are kept (so nothing silently
 * vanishes and nothing links to a dead page) and can be removed by the customer.
 */
export function UnavailableContent({ refs, onRemove, where }: { refs: ItemRef[]; onRemove: (r: ItemRef) => void; where: string }) {
  if (!refs.length) return null;
  return (
    <section aria-label="Unavailable content" className="mt-10 rounded-xl border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <AlertCircle className="size-4 text-warning" aria-hidden /> Unavailable content ({refs.length})
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">These titles are no longer available on StreamVerse. They may have been removed or taken down. You can remove them from {where}.</p>
      <ul className="mt-3 divide-y divide-border">
        {refs.map((r) => (
          <li key={refKey(r)} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Unavailable {r.type === "Movie" ? "movie" : r.type === "eBook" ? "eBook" : "audiobook"}
            </span>
            <Btn size="sm" onClick={() => onRemove(r)} aria-label={`Remove unavailable ${r.type} from ${where}`}>
              Remove
            </Btn>
          </li>
        ))}
      </ul>
    </section>
  );
}
