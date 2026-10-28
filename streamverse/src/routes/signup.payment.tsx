import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, CreditCard, RefreshCcw, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateUser, useProfile, useSubscription, useUserHydrated } from "@/lib/user";
import { usePlans } from "@/lib/store";
import { SignupStepper } from "@/components/sv/SignupStepper";
import { SIGNUP_PLAN_KEY } from "./signup.plan";
import type { Plan } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useApiPlansQuery, planPriceDollars, planInterval } from "@/hooks/useApiPlans";
import { meApi } from "@/api/me.api";
import { useApiSubscriptionQuery } from "@/hooks/useApiSubscription";
import { isApiError } from "@/api/client";
import type { ApiPlan } from "@/api/types";
import { StripePayBox } from "@/components/sv/billing/StripePayBox";
import { StripePopupButton } from "@/components/sv/billing/StripePopupButton";
import { stripeConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/signup/payment")({
  head: () => ({ meta: [{ title: "Set Up Payment — StreamVerse" }] }),
  component: PaymentStep,
});

type PayState = "idle" | "processing" | "canceled" | "failed";

function PaymentStep() {
  const navigate = useNavigate();
  const profile = useProfile();
  const sub = useSubscription();
  const localPlans = usePlans();
  const apiPlansQuery = useApiPlansQuery();
  const isGuest = profile.email === "alex@streamverse.tv" && profile.name === "Alex Morgan";
  // Live: the server says whether this customer already has a membership (the browser store only holds demo data)
  const serverSub = useApiSubscriptionQuery();
  const serverActive = ["ACTIVE", "TRIALING"].includes(String((serverSub.data as { status?: string } | undefined)?.status ?? ""));
  const isActive = DEMO_MODE ? !isGuest && sub.status === "active" : serverActive;
  const subKnown = DEMO_MODE || !serverSub.isLoading;

  const hydrated = useUserHydrated();
  const [planName, setPlanName] = useState<string>("");
  const [payState, setPayState] = useState<PayState>("idle");
  const [apiError, setApiError] = useState<string>("");

  useEffect(() => {
    if (!hydrated || !subKnown) return;
    if (isActive) {
      void navigate({ to: "/", replace: true });
      return;
    }
    if (isGuest) {
      void navigate({ to: "/signup/account", replace: true });
      return;
    }
    const saved = (() => {
      try {
        return sessionStorage.getItem(SIGNUP_PLAN_KEY);
      } catch {
        return null;
      }
    })();
    if (!saved) {
      void navigate({ to: "/signup/plan", replace: true });
      return;
    }
    setPlanName(saved);
  }, [hydrated, subKnown, isActive, isGuest, navigate]);

  // In real-API mode resolve plan from backend data (keyed by name for now; ID stored in sessionStorage once we switch to ID-based selection)
  const apiPlans: ApiPlan[] = apiPlansQuery.data ?? [];
  const apiSelectedPlan: ApiPlan | undefined = DEMO_MODE
    ? undefined
    : apiPlans.find((p) => p.name === planName);
  const selectedPlan: Plan | undefined = DEMO_MODE
    ? localPlans.find((p) => p.name === planName)
    : apiSelectedPlan
      ? { name: apiSelectedPlan.name, price: planPriceDollars(apiSelectedPlan), interval: planInterval(apiSelectedPlan), features: apiSelectedPlan.features.join(", "), active: apiSelectedPlan.active, subs: 0 }
      : localPlans.find((p) => p.name === planName);

  /** The customer paid (in the box or in the Stripe popup): the plan choice is used up, on to the welcome page. */
  function onPaid() {
    try { sessionStorage.removeItem(SIGNUP_PLAN_KEY); } catch { /* ignore */ }
    void navigate({ to: "/signup/complete" });
  }

  async function onStartMembership() {
    if (!selectedPlan || payState === "processing") return;
    setPayState("processing");
    setApiError("");

    // Live payments happen in the Stripe box / popup (see below); this button only exists in demo mode.
    if (!DEMO_MODE) return;

    // Demo mode: simulate payment
    await new Promise((r) => setTimeout(r, 1500));

    const today = new Date();
    const renewDate = new Date(today);
    if (selectedPlan.interval === "Monthly") {
      renewDate.setMonth(renewDate.getMonth() + 1);
    } else {
      renewDate.setFullYear(renewDate.getFullYear() + 1);
    }

    updateUser((s) => ({
      ...s,
      subscription: {
        ...s.subscription,
        plan: selectedPlan.name,
        price: selectedPlan.price,
        interval: selectedPlan.interval as "Monthly" | "Yearly",
        status: "active",
        startedOn: today.toISOString().slice(0, 10),
        renewsOn: renewDate.toISOString().slice(0, 10),
        billing: [
          {
            id: `INV-${Math.floor(100000 + Math.random() * 900000).toString()}`,
            date: today.toISOString().slice(0, 10),
            plan: selectedPlan.name,
            amount: selectedPlan.price,
            status: "Succeeded" as const,
          },
          ...s.subscription.billing,
        ],
      },
    }));

    try {
      sessionStorage.removeItem(SIGNUP_PLAN_KEY);
    } catch {
      /* ignore */
    }

    void navigate({ to: "/signup/complete" });
  }

  if (!selectedPlan && planName) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-10 md:py-16">
      <SignupStepper step={3} />

      <div className="mt-8 max-w-md text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Set up your payment</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your membership begins after payment is confirmed.
        </p>
      </div>

      <div className="mt-8 w-full max-w-md space-y-4">
        {/* Plan summary */}
        {selectedPlan && (
          <div className="rounded-xl border border-border bg-surface-2 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected plan
                </p>
                <p className="mt-1 text-lg font-bold text-foreground">{selectedPlan.name}</p>
                <p className="text-sm text-soft">
                  ${selectedPlan.price} /{" "}
                  {selectedPlan.interval === "Monthly" ? "month" : "year"}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{selectedPlan.features}</p>
              </div>
              <button
                onClick={() => void navigate({ to: "/signup/plan" })}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-soft transition hover:bg-surface-3 hover:text-foreground"
              >
                Change
              </button>
            </div>
          </div>
        )}

        {/* Payment panel */}
        <div className="rounded-xl border border-border bg-surface-2 p-5">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">Secure payment via Stripe</span>
            {DEMO_MODE && (
              <span className="ml-auto rounded border border-border bg-surface-3 px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                Test Mode
              </span>
            )}
          </div>

          {DEMO_MODE ? (
            <div className="rounded-lg border border-border/50 bg-surface-3 p-4 text-center">
              <p className="font-medium text-soft">Demo environment</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Click "Start Membership" to simulate a successful payment and activate your plan.
              </p>
            </div>
          ) : !stripeConfigured ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" role="alert">
              Online payment is not available right now. Please try again later.
            </p>
          ) : apiSelectedPlan ? (
            <div className="space-y-4">
              <StripePayBox planId={apiSelectedPlan.id} label={`Pay $${selectedPlan?.price ?? ""} and start membership`} onPaid={onPaid} onProblem={setApiError} />
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <StripePopupButton planId={apiSelectedPlan.id} onPaid={onPaid} onProblem={setApiError} />
            </div>
          ) : null}

          {apiError && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-medium text-red-400">{apiError}</p>
            </div>
          )}

          {payState === "canceled" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
              <RefreshCcw className="size-4 shrink-0 text-warning" />
              <p className="text-sm text-warning">Payment wasn't completed. Please try again.</p>
            </div>
          )}

          {payState === "failed" && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-medium text-red-400">We couldn't complete your payment.</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Please check your details and try again.
              </p>
            </div>
          )}
        </div>

        {/* Trust line */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Shield className="size-3.5 text-success" />
            Secure checkout
          </span>
          <span>·</span>
          <span>Cancel anytime</span>
          <span>·</span>
          <Link to="/refund-policy" className="hover:text-foreground">
            Refund Policy
          </Link>
        </div>

        {/* CTA */}
        {DEMO_MODE && (
        <button
          onClick={() => void onStartMembership()}
          disabled={payState === "processing" || !selectedPlan}
          className={cn(
            "w-full rounded-lg px-4 py-3 text-sm font-bold text-white transition disabled:opacity-70",
            payState === "processing" ? "cursor-wait bg-primary/70" : "bg-primary hover:bg-primary/90",
          )}
        >
          {payState === "processing" ? "Processing payment…" : "Start Membership"}
        </button>
        )}

        <button
          onClick={() => void navigate({ to: "/signup/account" })}
          className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
      </div>
    </div>
  );
}
