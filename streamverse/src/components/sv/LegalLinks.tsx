import { Link } from "@tanstack/react-router";
import { LEGAL_LINKS } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** A quiet line of legal links. `lead` is optional sentence text that comes before them. */
export function LegalLinks({ lead, className }: { lead?: string; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {lead && <span>{lead} </span>}
      {LEGAL_LINKS.map((l, i) => (
        <span key={l.to}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <Link to={l.to} className="underline underline-offset-2 hover:text-foreground">
            {l.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
