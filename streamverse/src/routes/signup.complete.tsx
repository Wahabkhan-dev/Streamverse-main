import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { takeReturnTo } from "@/lib/authSession";
import { BILLING_CHANNEL } from "@/components/sv/billing/StripePopupButton";
import { syncSubscription } from "@/lib/billingSync";
import { DEMO_MODE } from "@/lib/config";
import { useProfile, useSubscription, useUserHydrated } from "@/lib/user";

export const Route = createFileRoute("/signup/complete")({
  head: () => ({ meta: [{ title: "Welcome to StreamVerse" }] }),
  // Stripe sends the popup window back here with popup=1
  validateSearch: (s: Record<string, unknown>): { popup?: "1" } => (s["popup"] === "1" ? { popup: "1" } : {}),
  component: CompleteStep,
});

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

function CompleteStep() {
  // a visitor who was sent to sign up from a protected page carries on to it
  const [dest, setDest] = useState("/");
  useEffect(() => {
    const back = takeReturnTo();
    if (back) setDest(back);
  }, []);
  const navigate = useNavigate();
  const profile = useProfile();
  const sub = useSubscription();
  const hydrated = useUserHydrated();
  const isGuest = profile.email === "alex@streamverse.tv" && profile.name === "Alex Morgan";
  const isActive = !isGuest && sub.status === "active";

  // Live: the membership is whatever Stripe says right now (this page is also where the Stripe popup lands)
  const { popup } = Route.useSearch();
  const [checked, setChecked] = useState(DEMO_MODE);
  useEffect(() => {
    if (DEMO_MODE) return;
    void syncSubscription()
      .then((paid) => {
        if (paid && popup) {
          // the window that opened this popup is told over a same-site channel (Stripe cuts the opener link), then this closes
          const channel = new BroadcastChannel(BILLING_CHANNEL);
          channel.postMessage({ type: "paid" });
          channel.close();
          window.close();
        }
      })
      .catch(() => undefined)
      .finally(() => setChecked(true));
  }, [popup]);

  useEffect(() => {
    if (hydrated && checked && !isActive) {
      void navigate({ to: "/signup/plan", replace: true });
    }
  }, [hydrated, checked, isActive, navigate]);

  if (!isActive) return null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      {/* Success icon */}
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-success/10 ring-4 ring-success/25">
        <CheckCircle2 className="size-10 text-success" />
      </div>

      <h1 className="mt-8 text-3xl font-bold tracking-tight sm:text-4xl">You're all set.</h1>
      <p className="mt-3 max-w-sm text-base text-muted-foreground">
        Welcome to StreamVerse
        {profile.name ? `, ${profile.name.split(" ")[0]}` : ""}. Your membership is now active.
      </p>

      {/* Membership summary */}
      <div className="mt-8 w-full max-w-xs rounded-xl border border-border bg-surface-2 p-5 text-left">
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-semibold text-foreground">{sub.plan}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-semibold capitalize text-success">Active</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Billing</dt>
            <dd className="font-semibold text-foreground">
              ${sub.price} / {sub.interval === "Monthly" ? "mo" : "yr"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Next renewal</dt>
            <dd className="font-semibold text-foreground">{formatDate(sub.renewsOn)}</dd>
          </div>
        </dl>
      </div>

      {/* CTA */}
      <Link
        to={dest as "/"}
        className="mt-8 flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-bold text-white transition hover:bg-primary/90"
      >
        <Sparkles className="size-4" />
        {dest === "/" ? "Start Exploring" : "Continue"}
      </Link>

      <p className="mt-5 text-xs text-muted-foreground">
        Manage your subscription in{" "}
        <Link to="/subscription" className="font-medium text-primary-text hover:underline">
          Account Settings
        </Link>
        .
      </p>
    </div>
  );
}
