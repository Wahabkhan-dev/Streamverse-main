import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** What a screen shows while it is getting ready: never a blank page. `label` is also read out by screen readers. */
export function PageLoading({ label = "Loading…", fullScreen = false, className }: { label?: string; fullScreen?: boolean; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("grid place-items-center bg-background px-4 text-center", fullScreen ? "min-h-dvh" : "min-h-[50vh]", className)}>
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <span>{label}</span>
      </div>
    </div>
  );
}
