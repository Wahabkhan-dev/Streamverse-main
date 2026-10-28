import { AlertTriangle } from "lucide-react";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** What a screen shows in place of data that could not be loaded: what happened, in words, and a way to try again. */
export function QueryError({ error, what = "This", onRetry, className }: { error: unknown; what?: string; onRetry?: () => void; className?: string }) {
  const e = describeError(error);
  return (
    <div role="alert" data-testid="query-error" className={cn("mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-surface-2 px-6 py-10 text-center", className)}>
      <div className="grid size-11 place-items-center rounded-full bg-warning/15 text-warning">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <h2 className="text-base font-semibold">{what} could not be loaded</h2>
      <p className="text-sm text-muted-foreground">{e.detail}</p>
      {onRetry && e.retryable && (
        <button className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
