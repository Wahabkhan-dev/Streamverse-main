import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { AccountLayout, isAccountPath } from "@/components/sv/AccountNav";
import { TopNavbar } from "@/components/sv/TopNavbar";
import { Logo } from "@/components/sv/Logo";
import { SiteFooter } from "@/components/sv/SiteFooter";
import { AuthGate } from "@/components/sv/AuthGate";
import { SignInPromptHost } from "@/components/sv/SignInPrompt";
import { InstallPrompt } from "@/components/sv/InstallPrompt";
import { MiniPlayer } from "@/components/sv/players/MiniPlayer";
import { useEffect } from "react";
import { fromServer } from "@/lib/server-settings";
import { update, useSettings } from "@/lib/store";
import { useRole } from "@/lib/user";
import { useQuery } from "@tanstack/react-query";
import { api, isApiError } from "@/api/client";
import { DEMO_MODE } from "@/lib/config";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_site")({
  component: SiteLayout,
});

function SiteLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
  // The admin's age gate and autoplay switches are public settings: copy them into the browser store for every visitor, so they
  // reach customers (before, only an admin's own browser ever loaded them).
  useEffect(() => {
    const d = publicSettings.data;
    if (DEMO_MODE || !d) return;
    const m = fromServer(d);
    update((st) => ({ settings: { ...st.settings, ageGate: m.ageGate, autoplayNext: m.autoplayNext, autoplayPreview: m.autoplayPreview } }));
  }, [publicSettings.data]);
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
      <SignInPromptHost />
      <main>
        <AuthGate>
          {/* the account pages (Profile, Subscription, Downloads...) carry their own tabs, so the account menu is needed only once */}
          {isAccountPath(pathname) ? (
            <AccountLayout>
              <Outlet />
            </AccountLayout>
          ) : (
            <Outlet />
          )}
        </AuthGate>
      </main>
      <SiteFooter />
    </div>
  );
}
