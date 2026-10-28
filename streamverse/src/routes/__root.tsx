import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { hydrateDrafts } from "../lib/drafts";
import { hydrateLegal } from "../lib/legal";
import { hydrateStore } from "../lib/store";
import { hydrateUser } from "../lib/user";
import { BackendNoticeHost } from "../components/sv/BackendNotice";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { GeneralError, NotFoundScreen } from "../components/sv/states";
import { Toaster } from "../components/ui/sonner";
import { DEMO_MODE } from "../lib/config";
import { initSentry } from "../lib/sentry";
import { useAuthState } from "../lib/authState";
import { bootstrapAuth, mirrorAuthUser } from "../lib/authSession";
import { ConnectionBanner } from "../components/sv/ConnectionBanner";
import { InternetDialog } from "../components/sv/InternetDialog";
import { renewDownloads } from "../lib/offline/downloads";
import { mirrorSubscription } from "../lib/billingSync";

// Initialize Sentry as early as possible
initSentry();

function NotFoundComponent() {
  return (
    <div className="min-h-dvh bg-background">
      <NotFoundScreen />
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-background" data-testid="app-crash">
      <GeneralError
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "StreamVerse" },
      { name: "description", content: "Movies, eBooks and audiobooks in one place." },
      { property: "og:title", content: "StreamVerse" },
      { property: "og:description", content: "Movies, eBooks and audiobooks in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // installable app (PWA)
      { name: "theme-color", content: "#070707" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "StreamVerse" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Start checking the existing session the moment the app loads, long before any header or page mounts. Every screen reads
// the one shared auth state (lib/authState); nothing else asks the server who is signed in.
if (typeof window !== "undefined" && !DEMO_MODE) void bootstrapAuth();

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const auth = useAuthState();
  useEffect(() => {
    // Always hydrate localStorage stores (demo mode + fallback data)
    hydrateStore();
    hydrateUser();
    hydrateDrafts();
    hydrateLegal();
  }, []);

  // Installable app + our own "can't reach StreamVerse" screen instead of the browser's error page. The worker only handles
  // page loads and built files, so it is harmless in development too.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      // once per visit: the worker re-saves the app's files (a new release has new file names)
      .then((reg) => reg.active?.postMessage("precache"))
      .catch(() => undefined);
  }, []);

  // The screens that still read the browser store (role, profile name) follow the server's answer once it is known.
  useEffect(() => {
    if (DEMO_MODE) return;
    if (auth.status === "authenticated") mirrorAuthUser(auth.user);
    else if (auth.status === "unauthenticated") mirrorAuthUser(null);
  }, [auth.status, auth.user]);

  // ...and so does the membership shown in the header and on the signup pages (once per signed-in customer)
  const userId = auth.user?.id;
  useEffect(() => {
    if (DEMO_MODE || !userId) return undefined;
    void mirrorSubscription().catch(() => undefined);
    // downloads stay valid only while the customer is entitled: checked now and whenever the connection comes back
    void renewDownloads();
    const onBack = () => void renewDownloads();
    window.addEventListener("online", onBack);
    return () => window.removeEventListener("online", onBack);
  }, [userId]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <ConnectionBanner />
        <InternetDialog />
        <Outlet />
        <Toaster theme="dark" />
        <BackendNoticeHost />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
