import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TopNavbar } from "@/components/sv/TopNavbar";
import { Logo } from "@/components/sv/Logo";
import { LEGAL_LINKS } from "@/lib/legal";
import { AuthGate } from "@/components/sv/AuthGate";
import { InstallPrompt } from "@/components/sv/InstallPrompt";
import { MiniPlayer } from "@/components/sv/players/MiniPlayer";
import { useSettings } from "@/lib/store";
import { useRole } from "@/lib/user";
import { useQuery } from "@tanstack/react-query";
import { api, isApiError } from "@/api/client";
import { DEMO_MODE } from "@/lib/config";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_site")({
  component: SiteLayout,
});

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
  const { maintenance: demoMaintenance } = useSettings();
  const role = useRole();
  // live mode: the server decides. While maintenance is on it answers every non-admin request with 503 MAINTENANCE_MODE
  // (and the public settings say so), so either signal shows the screen; an admin always gets through.
  const publicSettings = useQuery({
    queryKey: ["settings", "public"],
    enabled: !DEMO_MODE,
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => (await api.get<{ data: Record<string, unknown> }>("/settings/public")).data,
  });
  const serverMaintenance = isApiError(publicSettings.error) ? publicSettings.error.code === "MAINTENANCE_MODE" : publicSettings.data?.["maintenanceMode"] === true;
  const maintenance = DEMO_MODE ? demoMaintenance : serverMaintenance && role !== "admin";
  if (maintenance) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4 text-center">
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
    <div className="min-h-dvh bg-background">
      <TopNavbar />
      <InstallPrompt />
      <MiniPlayer />
      <main>
        <AuthGate>
          <Outlet />
        </AuthGate>
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
