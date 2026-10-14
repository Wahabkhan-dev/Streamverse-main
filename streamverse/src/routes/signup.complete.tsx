import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useProfile, useSubscription, useUserHydrated } from "@/lib/user";

export const Route = createFileRoute("/signup/complete")({
  head: () => ({ meta: [{ title: "Welcome to StreamVerse" }] }),
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
  const navigate = useNavigate();
  const profile = useProfile();
  const sub = useSubscription();
  const hydrated = useUserHydrated();
  const isGuest = profile.email === "alex@streamverse.tv" && profile.name === "Alex Morgan";
  const isActive = !isGuest && sub.status === "active";

  useEffect(() => {
    if (hydrated && !isActive) {
      void navigate({ to: "/signup/plan", replace: true });
    }
  }, [hydrated, isActive, navigate]);

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
        to="/"
        className="mt-8 flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-bold text-white transition hover:bg-primary/90"
      >
        <Sparkles className="size-4" />
        Start Exploring
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
