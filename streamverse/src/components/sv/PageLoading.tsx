import { cn } from "@/lib/utils";
import { SvLoader } from "./SvLoader";

/** What a screen shows while it is getting ready: never a blank page. `label` is also read out by screen readers. */
export function PageLoading({
  label = "Loading…",
  fullScreen = false,
  className,
}: {
  label?: string;
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "grid place-items-center px-4 text-center",
        fullScreen ? "min-h-dvh" : "min-h-[50vh]",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
        <SvLoader />
        <span>{label}</span>
      </div>
    </div>
  );
}
