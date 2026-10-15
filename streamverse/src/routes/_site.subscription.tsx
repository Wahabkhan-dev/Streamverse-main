import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Check, CreditCard, Download, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { showBackendNotice } from "@/components/sv/BackendNotice";
import { LegalLinks } from "@/components/sv/LegalLinks";
import { PaymentFailed, SubscriptionExpired } from "@/components/sv/states";
import { Btn, ConfirmDialog, Panel, PanelHeader, Skel, StatusBadge } from "@/components/sv/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCsv } from "@/lib/csv";
import { DEMO_MODE } from "@/lib/demo";
import { pushOwnNote } from "@/lib/notifications";
import { defaultCardOf, expiryLabel, usePaymentMethods, type CardBrand, type SavedCard } from "@/lib/payment-methods";
import { usePlans, useSettings, type Plan } from "@/lib/store";
import { updateUser, useSubscription, type SubscriptionStatus } from "@/lib/user";
import { cn } from "@/lib/utils";
import {
  useApiSubscriptionQuery,
  useApiPaymentMethodsQuery,
  useApiInvoicesQuery,
  useCancelSubscriptionMutation,
  useResumeSubscriptionMutation,
  useChangePlanMutation,
} from "@/hooks/useApiSubscription";
import { useApiPlansQuery, planPriceDollars, planInterval } from "@/hooks/useApiPlans";
import type { ApiPlan, ApiPaymentMethod, ApiInvoice } from "@/api/types";
import type { Bill } from "@/lib/user";

export const Route = createFileRoute("/_site/subscription")({
  head: () => ({ meta: [{ title: "Subscription — StreamVerse" }, { name: "description", content: "Your plan, renewal date and billing history." }] }),
  component: SubscriptionPage,
});

const money = (n: number) => `$${n.toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "long" });
const perLabel = (interval: string) => (interval === "Yearly" ? "year" : "month");

/** Map an API plan to the local Plan shape expected by the upgrade/downgrade dialog. */
function apiPlanToLocal(p: ApiPlan): Plan {
  return { name: p.name, price: planPriceDollars(p), interval: planInterval(p), features: p.features.join(", "), active: p.active, subs: 0 };
}

/** Map an API payment method to the local SavedCard shape for display. */
function apiCardToLocal(c: ApiPaymentMethod): SavedCard {
  const brand = ((): CardBrand => {
    const b = c.brand.toLowerCase();
    if (b === "visa") return "Visa";
    if (b.includes("master")) return "Mastercard";
    if (b.includes("amex") || b.includes("american")) return "American Express";
    if (b === "discover") return "Discover";
    return "Card";
  })();
  return {
    id: c.id, brand, last4: c.last4, expMonth: c.expMonth, expYear: c.expYear, isDefault: c.isDefault,
    ...(c.holderName !== undefined ? { holderName: c.holderName } : {}),
    ...(c.country !== undefined ? { country: c.country } : {}),
  };
}

/** Map an API invoice to the local Bill shape. */
function apiInvoiceToLocal(inv: ApiInvoice): Bill {
  const status: Bill["status"] =
    inv.status === "paid" ? "Succeeded"
    : inv.status === "open" ? "Pending"
    : "Failed";
  return { id: inv.id, date: inv.date, plan: inv.plan ?? "", amount: inv.amount / 100, status };
}

function SubscriptionPage() {
  const navigate = useNavigate();

  // ── Demo-mode data (hooks always called unconditionally) ────────────────
  const demoSub = useSubscription();
  const demoCards = usePaymentMethods();
  const demoPlans = usePlans().filter((p) => p.active);
  const settings = useSettings();

  // ── API hooks (enabled: !DEMO_MODE internally) ──────────────────────────
  const apiSubQuery = useApiSubscriptionQuery();
  const apiPaymentsQuery = useApiPaymentMethodsQuery();
  const apiInvoicesQuery = useApiInvoicesQuery();
  const apiPlansQuery = useApiPlansQuery();
  const cancelMutation = useCancelSubscriptionMutation();
  const resumeMutation = useResumeSubscriptionMutation();
  const changePlanMutation = useChangePlanMutation();

  // ── Component state ─────────────────────────────────────────────────────
  const [dialog, setDialog] = useState<null | "manage" | "upgrade" | "downgrade">(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [choice, setChoice] = useState<Plan | null>(null);
  const [planKind, setPlanKind] = useState<"upgrade" | "downgrade">("upgrade");

  // ── Unified data (computed before early returns because of useMemo) ──────
  type SubView = typeof demoSub;
  const sub = useMemo((): SubView => {
    if (DEMO_MODE) return demoSub;
    const s = apiSubQuery.data;
    if (!s) return demoSub; // fallback (loading/error handled below)
    const invoices: Bill[] = (apiInvoicesQuery.data ?? []).map(apiInvoiceToLocal);
    return {
      plan: s.plan?.name ?? "Unknown",
      price: s.plan ? planPriceDollars(s.plan) : 0,
      interval: (s.plan ? planInterval(s.plan) : "Monthly") as "Monthly" | "Yearly",
      status: (s.status === "trialing" ? "active" : s.status) as SubscriptionStatus,
      startedOn: s.currentPeriodStart,
      renewsOn: s.currentPeriodEnd,
      pendingChange: s.pendingPlanChange
        ? {
            plan: s.pendingPlanChange.plan?.name ?? "",
            price: s.pendingPlanChange.plan ? planPriceDollars(s.pendingPlanChange.plan) : 0,
            interval: (s.pendingPlanChange.plan ? planInterval(s.pendingPlanChange.plan) : "Monthly") as "Monthly" | "Yearly",
            on: s.pendingPlanChange.effectiveDate,
          }
        : null,
      billing: invoices,
    };
  }, [DEMO_MODE, demoSub, apiSubQuery.data, apiInvoicesQuery.data]);

  const cards = useMemo(
    () => (DEMO_MODE ? demoCards : (apiPaymentsQuery.data ?? []).map(apiCardToLocal)),
    [DEMO_MODE, demoCards, apiPaymentsQuery.data],
  );

  const plans = useMemo(
    () => (DEMO_MODE ? demoPlans : (apiPlansQuery.data ?? []).filter((p) => p.active).map(apiPlanToLocal)),
    [DEMO_MODE, demoPlans, apiPlansQuery.data],
  );

  // API plan name → ID map (for changePlan mutation)
  const apiPlanIdByName = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const p of apiPlansQuery.data ?? []) m.set(p.name, p.id);
    return m;
  }, [apiPlansQuery.data]);

  // ── Loading / error guards (API mode only — must come AFTER all hooks) ──
  if (!DEMO_MODE && apiSubQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 pt-8 md:px-8">
        <Skel className="h-8 w-48" />
        <Skel className="mt-2 h-4 w-64" />
        <Skel className="mt-6 h-64 w-full rounded-xl" />
        <Skel className="mt-6 h-48 w-full rounded-xl" />
      </div>
    );
  }
  if (!DEMO_MODE && apiSubQuery.isError) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 pt-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Subscription</h1>
        <p className="mt-6 text-sm text-muted-foreground">Failed to load subscription details. Please refresh and try again.</p>
      </div>
    );
  }

  // ── Derived display values ───────────────────────────────────────────────
  const card = defaultCardOf(cards);
  const notify = (t: string, s: string) => DEMO_MODE && settings.notifyBilling && pushOwnNote("Subscription", t, s);
  const current = plans.find((p) => p.name === sub.plan);
  const openPlan = (k: "upgrade" | "downgrade") => { setPlanKind(k); setDialog(k); };

  const ordered = [...plans].sort((a, b) => monthly(a) - monthly(b));
  const here = monthly({ price: sub.price, interval: sub.interval });
  const higher = ordered.filter((p) => monthly(p) > here);
  const lower = ordered.filter((p) => monthly(p) < here);

  // ── Action handlers ──────────────────────────────────────────────────────
  const apply = (kind: "upgrade" | "downgrade", p: Plan) => {
    if (!DEMO_MODE) {
      const planId = apiPlanIdByName.get(p.name);
      if (!planId) { toast.error("Plan not found"); return; }
      changePlanMutation.mutate(planId, {
        onSuccess: () => {
          toast.success(kind === "upgrade" ? `You're now on ${p.name}` : `Switching to ${p.name} on ${day(sub.renewsOn)}`);
          setDialog(null);
          setChoice(null);
        },
        onError: () => toast.error("Failed to change plan. Please try again."),
      });
      return;
    }
    // Demo mode: local state mutation
    if (kind === "upgrade") {
      updateUser((s) => ({
        ...s,
        subscription: {
          ...s.subscription,
          plan: p.name,
          price: p.price,
          interval: p.interval === "Yearly" ? "Yearly" : "Monthly",
          status: "active",
          pendingChange: null,
          billing: [{ id: `INV-${Date.now().toString().slice(-4)}`, date: new Date().toISOString().slice(0, 10), plan: p.name, amount: p.price, status: "Succeeded" }, ...s.subscription.billing],
        },
      }));
      toast.success(`You're now on ${p.name}`);
      notify(`You're now on ${p.name}`, `${money(p.price)} / ${perLabel(p.interval)}`);
    } else {
      updateUser((s) => ({ ...s, subscription: { ...s.subscription, pendingChange: { plan: p.name, price: p.price, interval: p.interval === "Yearly" ? "Yearly" : "Monthly", on: s.subscription.renewsOn } } }));
      toast.success(`Switching to ${p.name} on ${day(sub.renewsOn)}`);
      notify(`Plan change scheduled: ${p.name}`, `Takes effect ${day(sub.renewsOn)}`);
    }
    setDialog(null);
    setChoice(null);
  };

  const setStatus = (status: SubscriptionStatus) => updateUser((s) => ({ ...s, subscription: { ...s.subscription, status } }));

  const statusLabel = sub.status === "active" ? "Active" : sub.status === "canceled" ? "Cancels at period end" : sub.status === "past_due" ? "Payment failed" : "Expired";
  const statusTone = sub.status === "active" ? "Active" : sub.status === "canceled" ? "Scheduled" : sub.status === "past_due" ? "Failed" : "Archived";

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 md:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Subscription</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your plan and billing.</p>

      {sub.status === "past_due" && (
        <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5">
          <PaymentFailed onUpdate={() => navigate({ to: "/payment-methods" })} onRetry={() => {
            if (!DEMO_MODE) { toast.info("Retry is handled via Stripe. Please update your payment method."); return; }
            setStatus("active"); toast.success("Payment retried (demo)");
          }} />
        </div>
      )}
      {sub.status === "expired" && (
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/5">
          <SubscriptionExpired onRenew={() => {
            if (!DEMO_MODE) { navigate({ to: "/payment-methods" }); return; }
            setStatus("active"); toast.success("Plan renewed (demo)");
          }} />
        </div>
      )}
      {sub.status === "canceled" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <span>Your plan is cancelled. You keep access until <b>{day(sub.renewsOn)}</b>.</span>
          <Btn variant="primary" onClick={() => {
            if (!DEMO_MODE) {
              resumeMutation.mutate(undefined, {
                onSuccess: () => toast.success("Plan resumed"),
                onError: () => toast.error("Failed to resume plan"),
              });
              return;
            }
            setStatus("active"); toast.success("Plan resumed");
          }}>
            Resume plan
          </Btn>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader title="Current plan" action={<StatusBadge status={statusTone} />} />
          <div className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="eyebrow text-primary-text">StreamVerse</div>
                <div className="text-2xl font-black tracking-tight">{`StreamVerse ${sub.plan}`}</div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black">{money(sub.price)}</span>
                <span className="text-sm text-muted-foreground"> / {perLabel(sub.interval)}</span>
              </div>
            </div>
            <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {(
                [
                  ["Plan", sub.plan],
                  ["Billing", `${sub.interval} · ${money(sub.price)}`],
                  ["Account status", statusLabel],
                  ["Member since", day(sub.startedOn)],
                  [sub.status === "canceled" ? "Access ends" : "Renewal date", day(sub.renewsOn)],
                  ["Next billing date", sub.status === "active" ? day(sub.renewsOn) : "None scheduled"],
                  ["Payment method", card ? `${card.brand} •••• ${card.last4} (exp ${expiryLabel(card)})` : "No payment method saved"],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {sub.pendingChange && (
              <p className="mt-4 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-soft">
                Switching to <b>{sub.pendingChange.plan}</b> ({money(sub.pendingChange.price)}/{perLabel(sub.pendingChange.interval)}) on {day(sub.pendingChange.on)}.
                {DEMO_MODE && (
                  <>
                    {" "}
                    <button type="button" className="font-semibold text-primary-text underline" onClick={() => updateUser((s) => ({ ...s, subscription: { ...s.subscription, pendingChange: null } }))}>
                      Undo
                    </button>
                  </>
                )}
              </p>
            )}
            <div className="mt-4">
              <Link to="/payment-methods" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3 [&_svg]:size-4">
                <CreditCard aria-hidden /> Manage payment methods
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Btn variant="primary" onClick={() => setDialog("manage")}>
                <Settings2 /> Manage Plan
              </Btn>
              <Btn onClick={() => openPlan("upgrade")} disabled={higher.length === 0}>
                <ArrowUp /> Upgrade
              </Btn>
              <Btn onClick={() => openPlan("downgrade")} disabled={lower.length === 0}>
                <ArrowDown /> Downgrade
              </Btn>
              <Btn variant="danger" onClick={() => setCancelOpen(true)} disabled={sub.status === "canceled" || sub.status === "expired"}>
                Cancel Plan
              </Btn>
            </div>
          </div>
        </Panel>
        <Panel className="h-fit">
          <PanelHeader title="What's included" />
          <ul className="space-y-2.5 p-5 text-sm">
            {(current?.features ?? "Movies, eBooks and audiobooks").split(",").map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-soft">
                <Check className="mt-0.5 size-4 shrink-0 text-success" /> {f.trim()}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-6">
        <PanelHeader
          title="Billing history"
          action={
            <Btn
              size="sm"
              onClick={() => {
                const ok = downloadCsv("streamverse-billing.csv", [["Invoice", "Date", "Plan", "Amount", "Status"], ...sub.billing.map((b) => [b.id, b.date, b.plan, b.amount.toFixed(2), b.status])]);
                if (ok) toast.success("Billing history downloaded");
                else showBackendNotice("Downloading invoices", "Your browser blocked the download.");
              }}
            >
              <Download /> Download
            </Btn>
          }
        />
        <div tabIndex={0} role="region" aria-label="Billing history" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Date", "Plan", "Amount", "Status", "Invoice"].map((h) => (
                  <th key={h} className="h-10 px-5 text-left text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sub.billing.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-soft">{day(b.date)}</td>
                  <td className="px-5 py-3">{b.plan}</td>
                  <td className="px-5 py-3 font-semibold">{money(b.amount)}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="max-w-[8rem] truncate px-5 py-3 font-mono text-xs text-muted-foreground">{b.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {DEMO_MODE && (
        <Panel className="mt-6">
          <PanelHeader title="Demo: preview subscription states" sub="Switch the account state to review each screen. Not shown in production." />
          <div className="flex flex-wrap gap-2 p-5">
            {(["active", "canceled", "past_due", "expired"] as SubscriptionStatus[]).map((s) => (
              <button key={s} type="button" aria-pressed={sub.status === s} onClick={() => setStatus(s)} className={cn("h-8 rounded-full border px-4 text-xs font-semibold", sub.status === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2 text-soft")}>
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* manage */}
      <Dialog open={dialog === "manage"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="border-border bg-surface-2 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage plan</DialogTitle>
            <DialogDescription>
              {sub.plan} · {money(sub.price)}/{perLabel(sub.interval)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Btn onClick={() => { setDialog(null); navigate({ to: "/payment-methods" }); }}>
              <CreditCard /> Update payment method
            </Btn>
            <Btn onClick={() => openPlan("upgrade")} disabled={higher.length === 0}>
              <ArrowUp /> Upgrade plan
            </Btn>
            <Btn onClick={() => openPlan("downgrade")} disabled={lower.length === 0}>
              <ArrowDown /> Downgrade plan
            </Btn>
            <Btn variant="danger" onClick={() => { setDialog(null); setCancelOpen(true); }} disabled={sub.status !== "active" && sub.status !== "past_due"}>
              Cancel plan
            </Btn>
          </div>
        </DialogContent>
      </Dialog>

      {/* upgrade / downgrade */}
      <Dialog
        open={dialog === "upgrade" || dialog === "downgrade"}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setChoice(null);
          }
        }}
      >
        <DialogContent className="border-border bg-surface-2 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{planKind === "upgrade" ? "Upgrade your plan" : "Downgrade your plan"}</DialogTitle>
            <DialogDescription>{planKind === "upgrade" ? "Takes effect immediately." : `Takes effect on ${day(sub.renewsOn)}, when your current period ends.`}</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Plans" className="grid gap-2">
            {(planKind === "upgrade" ? higher : lower).map((p) => (
              <label key={p.name} className={cn("flex cursor-pointer items-center gap-3 rounded-md border p-3", choice?.name === p.name ? "border-primary bg-primary/10" : "border-border bg-surface")}>
                <input type="radio" name="plan" className="accent-[var(--primary)]" checked={choice?.name === p.name} onChange={() => setChoice(p)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.features}</span>
                </span>
                <span className="text-sm font-bold">
                  {money(p.price)}
                  <span className="text-xs font-normal text-muted-foreground">/{perLabel(p.interval)}</span>
                </span>
              </label>
            ))}
          </div>
          <LegalLinks lead="By changing your plan you agree to our" />
          <div className="flex justify-end gap-2">
            <Btn onClick={() => { setDialog(null); setChoice(null); }}>Cancel</Btn>
            <Btn variant="primary" disabled={!choice || changePlanMutation.isPending} onClick={() => choice && apply(planKind, choice)}>
              {changePlanMutation.isPending ? "Applying…" : `Confirm ${planKind}`}
            </Btn>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel your plan?"
        description={`You'll keep access until ${day(sub.renewsOn)}. You can resume any time before then.`}
        confirmLabel="Cancel plan"
        onConfirm={() => {
          if (!DEMO_MODE) {
            cancelMutation.mutate(undefined, {
              onSuccess: () => {
                toast.success("Plan cancelled. Access continues until the end of the period.");
                setCancelOpen(false);
              },
              onError: () => toast.error("Failed to cancel plan. Please try again."),
            });
            return;
          }
          setStatus("canceled");
          toast.success("Plan cancelled. Access continues until the end of the period.");
          notify("Your plan was cancelled", `Access continues until ${day(sub.renewsOn)}`);
        }}
      />
      <LegalLinks lead="By subscribing, you agree to our Terms & Conditions and the applicable Refund Policy. See also our" className="mt-6 pb-4" />
    </div>
  );
}

function monthly(p: { price: number; interval: string }) {
  return p.interval === "Yearly" ? p.price / 12 : p.price;
}
