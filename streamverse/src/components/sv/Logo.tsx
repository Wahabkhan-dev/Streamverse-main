import { Link } from "@tanstack/react-router";

export function Logo({ to = "/" }: { to?: "/" }) {
  return (
    <Link to={to} className="flex items-center gap-1.5 select-none">
      <span className="grid size-7 place-items-center rounded-md bg-red-grad text-sm font-black text-primary-foreground shadow-red" aria-hidden="true">S</span>
      <span className="text-lg font-black tracking-tight">
        STREAM<span className="text-primary-text">VERSE</span>
      </span>
    </Link>
  );
}
