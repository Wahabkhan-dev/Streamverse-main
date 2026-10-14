import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlans } from "@/lib/store";
import { useProfile, useSubscription, useUserHydrated } from "@/lib/user";
import { SignupStepper } from "@/components/sv/SignupStepper";
import type { Plan } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useApiPlansQuery, planPriceDollars, planInterval } from "@/hooks/useApiPlans";
import type { ApiPlan } from "@/api/types";

export const SIGNUP_PLAN_KEY = "sv-signup-plan";

const BENEFITS = [
  "Stream unlimited movies",
  "Read thousands of eBooks",
  "Listen to audiobooks",
  "Cancel anytime",
  "Access across your devices",
];

function planFeatures(features: string): string[] {
  return features.split(",").map((s) => s.trim()).filter(Boolean);
}

function isRecommended(plan: Plan | ApiPlan): boolean {
  return plan.name === "Premium";
}

function readSessionPlan(): string {
  try {
    return sessionStorage.getItem(SIGNUP_PLAN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSessionPlan(name: string) {
  try {
    sessionStorage.setItem(SIGNUP_PLAN_KEY, name);
  } catch {
    /* ignore */
  }
}

export const Route = createFileRoute("/signup/plan")({
  head: () => ({ meta: [{ title: "Choose Your Plan — StreamVerse" }] }),
  component: PlanStep,
});

/** Normalise an API plan into the shape the template expects. */
function apiPlanToLocal(p: ApiPlan): Plan {
  return {
    name: p.name,
    price: planPriceDollars(p),
    interval: planInterval(p),
    features: p.features.join(", "),
    active: p.active,
    subs: 0,
  };
}

function PlanStep() {
  const navigate = useNavigate();
  const localPlans = usePlans();
  const apiPlansQuery = useApiPlansQuery();
  const profile = useProfile();
  const sub = useSubscription();
  const isGuest = profile.email === "alex@streamverse.tv" && profile.name === "Alex Morgan";
  const isActive = !isGuest && sub.status === "active";

  const hydrated = useUserHydrated();

  // When in real-API mode use backend plans; fall back to local store while loading or in demo mode
  const plans: Plan[] = DEMO_MODE
    ? localPlans
    : (apiPlansQuery.data?.map(apiPlanToLocal) ?? localPlans);

  const activePlans = plans.filter((p) => p.active);
  const [selected, setSelected] = useState<string>(() => readSessionPlan());

  useEffect(() => {
    if (hydrated && isActive) void navigate({ to: "/", replace: true });
  }, [hydrated, isActive, navigate]);

  function selectPlan(name: string) {
    setSelected(name);
    writeSessionPlan(name);
  }

  function onContinue() {
    if (!selected) return;
    void navigate({ to: "/signup/account" });
  }

  return (
    <div className="flex flex-col items-center px-4 py-10 md:py-16">
      <SignupStepper step={1} />

      {/* Hero copy */}
      <div className="mt-8 max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Choose the plan that fits you
        </h1>
        <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-3.5 text-success shrink-0" />
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* Plan cards */}
      <div className="mt-10 w-full max-w-4xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {activePlans.map((plan) => {
            const features = planFeatures(plan.features);
            const isSelected = selected === plan.name;
            const rec = isRecommended(plan);

            return (
              <button
                key={plan.name}
                onClick={() => selectPlan(plan.name)}
                aria-pressed={isSelected}
                aria-label={`${plan.name} plan, $${plan.price} ${plan.interval}`}
                className={cn(
                  "relative flex flex-col rounded-xl border-2 p-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-red"
                    : "border-border bg-surface-2 hover:border-primary/50 hover:bg-surface-3",
                )}
              >
                {rec && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="rounded-full bg-primary px-3 py-0.5 text-[11px] font-bold tracking-wider text-white uppercase">
                      Most Popular
                    </span>
                  </div>
                )}

                {isSelected && (
                  <div className="absolute right-3.5 top-3.5 grid size-5 place-items-center rounded-full bg-primary">
                    <Check className="size-3 text-white" />
                  </div>
                )}

                <span className="text-base font-bold text-foreground">{plan.name}</span>

                <div className="mt-2 flex items-end gap-1">
                  <span className="text-2xl font-black text-foreground">${plan.price}</span>
                  <span className="mb-0.5 text-xs text-muted-foreground">
                    / {plan.interval === "Monthly" ? "mo" : "yr"}
                  </span>
                </div>

                <ul className="mt-4 flex-1 space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-soft">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Comparison table */}
        {activePlans.length > 1 && (
          <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-surface-2">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pl-5 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Feature
                  </th>
                  {activePlans.map((p) => (
                    <th
                      key={p.name}
                      className={cn(
                        "px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider",
                        p.name === selected ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {(
                  [
                    {
                      label: "Price",
                      fn: (p: Plan) =>
                        p.interval === "Monthly" ? `$${p.price}/mo` : `$${p.price}/yr`,
                    },
                    {
                      label: "Video quality",
                      fn: (p: Plan) => {
                        if (/4K/i.test(p.features)) return "4K HDR";
                        if (/Full HD/i.test(p.features)) return "Full HD";
                        return "HD";
                      },
                    },
                    { label: "Movies", fn: () => "✓" },
                    {
                      label: "eBooks",
                      fn: (p: Plan) => (/eBook/i.test(p.features) ? "✓" : "—"),
                    },
                    {
                      label: "Audiobooks",
                      fn: (p: Plan) => (/Audiobook/i.test(p.features) ? "✓" : "—"),
                    },
                    {
                      label: "Screens",
                      fn: (p: Plan) => {
                        const m = /(\d+)\s*screen/i.exec(p.features);
                        return m ? m[1]! : "1";
                      },
                    },
                  ] as { label: string; fn: (p: Plan) => string }[]
                ).map((row) => (
                  <tr key={row.label}>
                    <td className="py-2.5 pl-5 pr-4 text-muted-foreground">{row.label}</td>
                    {activePlans.map((p) => (
                      <td
                        key={p.name}
                        className={cn(
                          "px-3 py-2.5 text-center font-medium",
                          p.name === selected ? "text-primary" : "text-soft",
                        )}
                      >
                        {row.fn(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="mt-10 w-full max-w-xs">
        <button
          onClick={onContinue}
          disabled={!selected}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
        {!selected && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Select a plan to continue</p>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/sign-in" className="font-semibold text-primary-text hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
