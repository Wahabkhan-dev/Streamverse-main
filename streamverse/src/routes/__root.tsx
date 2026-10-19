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
import { reportLovableError } from "../lib/lovable-error-reporting";
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
import { authApi } from "../api/auth.api";
import { getAccessToken, setAccessToken } from "../api/client";
import { setAuthUser, clearAuthUser } from "../lib/authState";

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
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="min-h-dvh bg-background">
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
      { title: "Stream Verse" },
      { name: "description", content: "Lovable Generated Project" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Stream Verse" },
      { property: "og:description", content: "Lovable Generated Project" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    // Always hydrate localStorage stores (demo mode + fallback data)
    hydrateStore();
    hydrateUser();
    hydrateDrafts();
    hydrateLegal();

    // In real-API mode, bootstrap auth state on every page load.
    // Try /auth/me first (uses stored access token). If no token, try refresh
    // (uses the httpOnly sv_refresh_token cookie that survives page reloads).
    if (!DEMO_MODE) {
      const token = getAccessToken();
      const attempt = token ? authApi.me().then((res) => res.data) : Promise.reject(new Error("no token"));
      attempt
        .catch(() =>
          authApi.refresh().then((res) => {
            setAccessToken(res.data.accessToken);
            return authApi.me().then((r) => r.data);
          }),
        )
        .then((user) => setAuthUser(user))
        .catch(() => clearAuthUser());
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster theme="dark" />
        <BackendNoticeHost />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
