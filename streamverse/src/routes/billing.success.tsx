import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BILLING_CHANNEL } from "@/components/sv/billing/StripePopupButton";
import { Logo } from "@/components/sv/Logo";
import { syncSubscription } from "@/lib/billingSync";
import { DEMO_MODE } from "@/lib/config";

export const Route = createFileRoute("/billing/success")({
  head: () => ({ meta: [{ title: "Payment received — StreamVerse" }] }),
  // Stripe sends the customer here with ?session_id=...; the popup flow adds popup=1
  validateSearch: (s: Record<string, unknown>): { popup?: "1"; session_id?: string } => ({
    ...(s["popup"] === "1" || s["popup"] === 1 ? { popup: "1" as const } : {}),
    ...(typeof s["session_id"] === "string" ? { session_id: s["session_id"] } : {}),
  }),
  component: BillingSuccess,
});

/** Stripe confirms the charge a moment before our copy of the subscription turns active: ask for a few seconds. */
async function waitUntilActive(): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    if (await syncSubscription().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function BillingSuccess() {
  const { popup } = Route.useSearch();
  const [state, setState] = useState<"checking" | "active" | "pending">(DEMO_MODE ? "active" : "checking");

  useEffect(() => {
    if (DEMO_MODE) return undefined;
    let alive = true;
    void waitUntilActive().then((paid) => {
      if (!alive) return;
      setState(paid ? "active" : "pending");
      if (paid && popup) {
        // Stripe cuts the link to the window that opened this popup, so it is told over a same-site channel, then this closes
        try {
          const channel = new BroadcastChannel(BILLING_CHANNEL);
          channel.postMessage({ type: "paid" });
          channel.close();
        } catch {
          /* the other window also polls the server, so it finds out anyway */
        }
        window.close();
      }
    });
    return () => {
      alive = false;
    };
  }, [popup]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />
      {state === "checking" ? (
        <>
          <Loader2 className="mt-10 size-10 animate-spin text-primary" aria-hidden />
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Confirming your payment…</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">This only takes a moment. Please don't close this window.</p>
        </>
      ) : (
        <>
          <div className="mt-10 grid size-16 place-items-center rounded-full bg-success/10 ring-4 ring-success/25">
            <CheckCircle2 className="size-8 text-success" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{state === "active" ? "Payment received" : "Payment received — activating"}</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {state === "active"
              ? popup
                ? "Your membership is active. You can close this window and go back to StreamVerse."
                : "Your membership is active. Welcome to StreamVerse."
              : "Thanks! Your membership is being set up and will show as active within a minute."}
          </p>
          <Link to={state === "active" ? "/signup/complete" : "/subscription"} className="mt-8 rounded-lg bg-primary px-8 py-3 text-sm font-bold text-white transition hover:bg-primary/90">
            {state === "active" ? "Continue" : "View my subscription"}
          </Link>
        </>
      )}
    </div>
  );
}
