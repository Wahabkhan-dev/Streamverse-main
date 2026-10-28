import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuthState } from "@/lib/authState";
import { bootstrapAuth, requiresLogin } from "@/lib/authSession";
import { PageLoading } from "./PageLoading";

/**
 * Keeps signed-out visitors off pages that need a session, WITHOUT ever treating "still checking" as "signed out":
 *   public page            -> shown at once
 *   session being checked  -> a quiet placeholder where the page goes (the header and the rest of the layout stay put)
 *   check failed (network) -> a retry message, never a guest redirect
 *   confirmed signed out   -> Sign In, remembering where the visitor was going
 *   confirmed signed in    -> the page
 */
export function AuthGate({ children, fullScreen = false }: { children: ReactNode; fullScreen?: boolean }) {
  const auth = useAuthState();
  const loc = useRouterState({ select: (s) => s.location });
  const navigate = useNavigate();
  const needs = requiresLogin(loc.pathname, loc.searchStr ?? "");
  const lost = needs && auth.status === "unauthenticated";
  const here = `${loc.pathname}${loc.searchStr ?? ""}${loc.hash ? `#${loc.hash}` : ""}`;

  useEffect(() => {
    if (!lost) return;
    void navigate({ to: "/sign-in", search: { returnTo: here, ...(auth.expired ? { reason: "expired" as const } : {}) }, replace: true });
  }, [lost, here, auth.expired, navigate]);

  if (!needs || auth.status === "authenticated") return <>{children}</>;
  if (lost) return null; // on its way to Sign In
  const box = fullScreen ? "min-h-dvh" : "min-h-[50vh]";
  if (auth.error)
    return (
      <div className={`${box} grid place-items-center px-4 text-center`} role="alert">
        <div>
          <p className="text-sm text-muted-foreground">We could not verify your session. Please try again.</p>
          <button className="mt-3 rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-3" onClick={() => void bootstrapAuth(true)}>
            Try again
          </button>
        </div>
      </div>
    );
  return <PageLoading label="Checking your session…" fullScreen={fullScreen} />;
}
