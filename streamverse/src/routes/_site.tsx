import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TopNavbar } from "@/components/sv/TopNavbar";
import { Logo } from "@/components/sv/Logo";
import { LEGAL_LINKS } from "@/lib/legal";
import { useSettings } from "@/lib/store";
import { useRole } from "@/lib/user";
import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_site")({
  component: SiteLayout,
});

/** Tracks the browser's online / offline state. */
function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** One labelled column of footer links. */
function FooterGroup({ title, links }: { title: string; links: readonly (readonly [string, string])[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-foreground uppercase">{title}</h2>
      <ul className="space-y-2 text-sm">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to as "/"} className="hover:text-foreground">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SiteLayout() {
  const online = useOnline();
  const { maintenance } = useSettings();
  const role = useRole();
  if (maintenance) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
        <div className="max-w-md">
          <Logo />
          <h1 className="mt-8 text-3xl font-bold tracking-tight">We'll be right back</h1>
          <p className="mt-2 text-sm text-muted-foreground">StreamVerse is undergoing scheduled maintenance. Please check back shortly.</p>
          {role === "admin" && (
            <Link to="/admin/settings" className="mt-6 inline-block text-xs font-semibold text-muted-foreground hover:text-foreground">
              Admin: turn off maintenance mode
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <TopNavbar />
      {!online && (
        <div role="alert" className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-center text-sm text-warning">
          <WifiOff className="size-4" /> You appear to be offline. Saved titles still work; new content needs a connection.
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <footer className="mt-16 border-t border-border bg-ink">
        <div className="mx-auto max-w-[1600px] px-4 py-10 text-sm text-muted-foreground md:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
            <div className="sm:col-span-2 lg:col-span-1">
              <Logo />
              <p className="mt-3 max-w-xs text-xs">Movies, eBooks and Audiobooks in one place.</p>
            </div>
            <FooterGroup title="Browse" links={[["/movies", "Movies"], ["/ebooks", "eBooks"], ["/audiobooks", "Audiobooks"], ["/collections", "Collections"]]} />
            <FooterGroup title="Account" links={[["/my-list", "My List"], ["/my-library", "My Library"], ["/history", "History"], ["/profile", "Profile"], ["/subscription", "Subscription"], ["/payment-methods", "Payment methods"]]} />
            <FooterGroup title="Legal" links={LEGAL_LINKS.map((l) => [l.to, l.label] as const)} />
          </div>
          <p className="mt-8 border-t border-border pt-6 text-xs">© 2026 StreamVerse</p>
        </div>
      </footer>
    </div>
  );
}
