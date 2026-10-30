import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The brand loader: the "S" badge with red rings rippling out from it. No background of its own, and it stays inside
 * its `size` box, so it can sit on any surface. Decorative only: the caller provides the text/role for screen readers.
 */
export function SvLoader({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("sv-loader", className)}
      style={{ "--sv-loader-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="sv-loader-ring" />
      <span className="sv-loader-ring" />
      <span className="sv-loader-ring" />
      <span className="sv-loader-ring" />
      <span className="sv-loader-logo bg-red-grad shadow-red">S</span>
    </div>
  );
}
