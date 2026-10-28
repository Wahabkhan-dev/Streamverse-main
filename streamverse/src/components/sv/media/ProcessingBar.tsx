import type { ProcessingProgress } from "@/api/mediaLibrary.api";
import { cn } from "@/lib/utils";

/** "about 2 h 5 min left", "about 4 min left", "less than a minute left" */
export function fmtTimeLeft(seconds: number): string {
  if (seconds < 60) return "less than a minute left";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `about ${h} h ${m} min left` : `about ${m} min left`;
}

/** One line under the bar: "42% · Converting to 720p (2 of 3) · about 12 min left". */
export function processingLine(p: ProcessingProgress): string {
  return [`${p.percent}%`, p.step, p.etaSeconds != null ? fmtTimeLeft(p.etaSeconds) : null]
    .filter(Boolean)
    .join(" · ");
}

/** The server-side processing bar: how much of the file is done, which step it is on, and the time left. */
export function ProcessingBar({
  progress,
  compact,
  className,
}: {
  progress: ProcessingProgress;
  compact?: boolean;
  className?: string;
}) {
  const line = processingLine(progress);
  return (
    <div className={cn("min-w-0", className)} data-testid="processing-bar">
      <div
        className={cn("overflow-hidden rounded-full bg-surface-3", compact ? "h-1" : "h-1.5")}
        role="progressbar"
        aria-label="Processing"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={line}
      >
        <div
          className="h-full bg-warning transition-all"
          style={{ width: `${Math.max(2, progress.percent)}%` }}
        />
      </div>
      <div
        className={cn(
          "mt-1 truncate text-muted-foreground",
          compact ? "text-[10px]" : "text-[11px]",
        )}
        title={line}
      >
        {line}
      </div>
    </div>
  );
}
