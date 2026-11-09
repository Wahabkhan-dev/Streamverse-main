import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** What one overview number opens: the figures behind it, a short list of what makes it up, and where to manage it. */
export interface KpiDetail {
  id: string;
  icon: React.ElementType;
  label: string;
  value: string;
  /** one sentence on what the number counts */
  about: string;
  stats: Array<{ label: string; value: string }>;
  list?: { title: string; empty: string; rows: Array<{ key: string; title: string; sub?: string; to?: string; params?: Record<string, string> }> };
  /** the tab where this is managed */
  open: { to: string; label: string };
}

export function KpiDetailDialog({ kpi, onClose }: { kpi: KpiDetail | null; onClose: () => void }) {
  return (
    <Dialog open={!!kpi} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-surface-2 sm:max-w-lg" data-testid="kpi-detail">
        {kpi && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-md bg-primary/12 text-primary-text">
                  <kpi.icon className="size-5" />
                </span>
                <div>
                  <DialogTitle>{kpi.label}</DialogTitle>
                  <div className="text-2xl font-bold tracking-tight">{kpi.value}</div>
                </div>
              </div>
              <DialogDescription>{kpi.about}</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-2">
              {kpi.stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
                  <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
                  <dd className="mt-0.5 text-base font-bold">{s.value}</dd>
                </div>
              ))}
            </dl>

            {kpi.list && (
              <div>
                <div className="mb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{kpi.list.title}</div>
                {kpi.list.rows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">{kpi.list.empty}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {kpi.list.rows.map((r) => (
                      <li key={r.key}>
                        {r.to ? (
                          <Link to={r.to as "/"} {...(r.params ? { params: r.params as never } : {})} onClick={onClose} className="block px-3 py-2 text-sm hover:bg-surface-3">
                            <span className="block truncate font-semibold">{r.title}</span>
                            {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                          </Link>
                        ) : (
                          <div className="px-3 py-2 text-sm">
                            <span className="block truncate font-semibold">{r.title}</span>
                            {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Link to={kpi.open.to as "/"} onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                {kpi.open.label} <ArrowRight className="size-4" />
              </Link>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
