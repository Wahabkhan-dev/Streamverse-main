import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/api/client";
import { meApi } from "@/api/me.api";
import type { ApiPaymentMethod, ApiPlan } from "@/api/types";
import { LegalLinks } from "@/components/sv/LegalLinks";
import { Btn } from "@/components/sv/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PAYMENT_METHODS_QUERY_KEY, useChangePlanMutation, useSetDefaultPaymentMethodMutation } from "@/hooks/useApiSubscription";
import { cn } from "@/lib/utils";
import { StripeSetupBox } from "./StripeSetupBox";

type Kind = "upgrade" | "downgrade";
type CurrentPlan = { id: string; name: string; priceAmount: number; currency: string; billingInterval: string };

const NEW_CARD = "new";
const perMonth = (p: { priceAmount: number; billingInterval: string }) => (p.billingInterval === "YEARLY" ? p.priceAmount / 12 : p.priceAmount);
const usd = (cents: number, currency = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const per = (interval: string) => (interval === "YEARLY" ? "year" : "month");
const longDay = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { dateStyle: "long" }) : "";
};
const cardName = (c: ApiPaymentMethod) => `${c.brand.charAt(0).toUpperCase()}${c.brand.slice(1)} •••• ${c.last4}`;

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 text-sm", strong && "border-t border-border pt-2 font-bold")}>
      <span className={cn("min-w-0", !strong && "text-muted-foreground")}>{label}</span>
      <span className={cn("shrink-0 text-right font-semibold", tone === "good" && "text-success")}>{value}</span>
    </div>
  );
}

/**
 * Upgrade / downgrade for a signed-in customer (live mode). It shows, before anything happens, what the change does to the bill
 * (an estimate; Stripe's invoice has the final figures), lets them pay an upgrade with the card on file or a new one, and only
 * proceeds once they have ticked that they agree. The server refuses a plan change that arrives without that consent.
 */
export function ChangePlanDialog({ kind, open, onClose, plans, current, cards }: { kind: Kind; open: boolean; onClose: () => void; plans: ApiPlan[]; current: CurrentPlan | null; cards: ApiPaymentMethod[] }) {
  const qc = useQueryClient();
  const change = useChangePlanMutation();
  const setDefault = useSetDefaultPaymentMethodMutation();
  const [planId, setPlanId] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string>(NEW_CARD);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const known = useRef<Set<string>>(new Set());

  const candidates = useMemo(
    () => (current ? plans.filter((p) => p.id !== current.id && (kind === "upgrade" ? perMonth(p) > perMonth(current) : perMonth(p) < perMonth(current))) : []),
    [plans, current, kind],
  );
  const defaultCard = cards.find((c) => c.isDefault) ?? cards[0];

  // every time the dialog opens: nothing chosen, nothing ticked, the card on file preselected
  useEffect(() => {
    if (!open) return;
    setPlanId(null);
    setConsent(false);
    setError("");
    setCardId(defaultCard?.id ?? NEW_CARD);
    known.current = new Set(cards.map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // a card just saved in the box below: pick it
  useEffect(() => {
    const added = cards.find((c) => !known.current.has(c.id));
    if (added) {
      known.current = new Set(cards.map((c) => c.id));
      setCardId(added.id);
    }
  }, [cards]);

  const preview = useQuery({
    queryKey: ["me", "plan-preview", planId],
    queryFn: async () => (await meApi.previewPlanChange(planId!)).data,
    enabled: open && !!planId && planId !== current?.id,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const p = preview.data;
  const chosen = candidates.find((c) => c.id === planId);
  const needsCard = kind === "upgrade" && (p?.chargeToday ?? 1) > 0;
  const cardReady = !needsCard || (cardId !== NEW_CARD && cards.some((c) => c.id === cardId));
  const canConfirm = !!p && consent && cardReady && !busy;

  async function confirm() {
    if (!p || !planId) return;
    setBusy(true);
    setError("");
    try {
      // an upgrade is charged to the customer's default card: make the one they picked the default first
      // (judged by what Stripe says is the default, not by the card that is merely listed first: with no default set, the first card is not one)
      const picked = cards.find((c) => c.id === cardId);
      if (needsCard && picked && !picked.isDefault) await setDefault.mutateAsync(picked.id);
      await change.mutateAsync({ planId, consent: true });
      void qc.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
      toast.success(
        kind === "upgrade"
          ? p.chargeToday > 0
            ? `You're now on ${p.toPlan.name}. ${usd(p.chargeToday, p.currency)} was charged to your card${p.creditApplied > 0 ? ` after using ${usd(p.creditApplied, p.currency)} of your credit` : ""}.`
            : `You're now on ${p.toPlan.name}. Your credit covered it, so nothing was charged.`
          : `You're now on ${p.toPlan.name}. ${usd(p.creditAdded, p.currency)} credit will be applied to your next invoice.`,
      );
      onClose();
    } catch (err) {
      setError(isApiError(err) ? err.message : "We couldn't change your plan. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-x-hidden border-border bg-surface-2 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === "upgrade" ? "Upgrade your plan" : "Downgrade your plan"}</DialogTitle>
          <DialogDescription>
            {kind === "upgrade"
              ? "Your new plan starts right away. We charge your card now for the difference, after crediting what you already paid for this period."
              : "Your new plan starts right away. The unused part of your current plan is kept as credit and used up by your next invoice."}
          </DialogDescription>
        </DialogHeader>

        {current && (
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm">
            <span className="shrink-0 text-muted-foreground">Your plan now</span>
            <span className="min-w-0 truncate text-right font-semibold">
              {current.name} · {usd(current.priceAmount, current.currency)}/{per(current.billingInterval)}
            </span>
          </div>
        )}

        {candidates.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-3 py-4 text-center text-sm text-muted-foreground">{kind === "upgrade" ? "You're on our highest plan." : "You're on our lowest plan."}</p>
        ) : (
          <div role="radiogroup" aria-label="Plans" className="grid gap-2">
            {candidates.map((c) => {
              const diff = current ? perMonth(c) - perMonth(current) : 0;
              return (
                <label key={c.id} className={cn("flex min-w-0 cursor-pointer items-center gap-3 rounded-md border p-3", planId === c.id ? "border-primary bg-primary/10" : "border-border bg-surface")}>
                  <input type="radio" name="plan" className="shrink-0 accent-[var(--primary)]" checked={planId === c.id} onChange={() => { setPlanId(c.id); setConsent(false); setError(""); }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{c.name}</span>
                    <span className="line-clamp-2 break-words text-xs text-muted-foreground">{c.features.join(", ")}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold">
                      {usd(c.priceAmount, c.currency)}
                      <span className="text-xs font-normal text-muted-foreground">/{per(c.billingInterval)}</span>
                    </span>
                    <span className={cn("block text-xs font-semibold", diff > 0 ? "text-warning" : "text-success")}>
                      {diff > 0 ? "+" : "-"}
                      {usd(Math.abs(diff), c.currency)}/mo
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {planId && preview.isLoading && <div className="h-24 animate-pulse rounded-md bg-surface-3" aria-busy="true" />}
        {planId && preview.isError && (
          <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {isApiError(preview.error) ? preview.error.message : "We couldn't work out the cost of this change. Please try again."}
          </p>
        )}

        {p && (
          <section aria-label="What this change costs" className="space-y-2 rounded-md border border-border bg-surface px-3 py-3">
            <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{kind === "upgrade" ? "What you pay" : "What you get back"}</div>
            {kind === "upgrade" ? (
              <>
                <Row label={`${p.toPlan.name} for the rest of this period (${p.daysLeft} days)`} value={usd(p.newPlanForRest, p.currency)} />
                <Row label={`Credit for unused ${p.fromPlan.name}`} value={`-${usd(p.creditForUnused, p.currency)}`} tone="good" />
                {p.creditApplied > 0 && <Row label="Your account credit used" value={`-${usd(p.creditApplied, p.currency)}`} tone="good" />}
                <Row label="Charged to your card today" value={usd(p.chargeToday, p.currency)} strong />
                {p.chargeToday === 0 && <p className="text-xs text-muted-foreground">Your credit covers this upgrade, so your card isn't charged today.</p>}
                {p.accountCredit > p.creditApplied && <p className="text-xs text-muted-foreground">{usd(p.accountCredit - p.creditApplied, p.currency)} of credit is left for your next invoice.</p>}
              </>
            ) : (
              <>
                <Row label={`Unused part of ${p.fromPlan.name}`} value={usd(p.creditForUnused, p.currency)} />
                <Row label={`${p.toPlan.name} for the rest of this period`} value={`-${usd(p.newPlanForRest, p.currency)}`} />
                <Row label="Credit added to your account" value={usd(p.creditAdded, p.currency)} tone="good" strong />
                {p.accountCredit > 0 && <Row label="Your total credit after this" value={usd(p.accountCredit + p.creditAdded, p.currency)} tone="good" />}
                <p className="text-xs text-muted-foreground">It's taken off your next invoice automatically. Unused time is not refunded to your card.</p>
              </>
            )}
            {p.nextRenewal && (
              <p className="text-xs text-muted-foreground">
                Next renewal: {usd(p.nextRenewal.amount, p.currency)}
                {longDay(p.nextRenewal.date) ? ` on ${longDay(p.nextRenewal.date)}` : ""}
                {kind === "downgrade" && p.creditAdded > 0 ? ", less your credit" : ""}.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">This is an estimate. Your Stripe invoice shows the exact amounts.</p>
          </section>
        )}

        {p && needsCard && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">Pay with</legend>
            {cards.map((c) => (
              <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm", cardId === c.id ? "border-primary bg-primary/10" : "border-border bg-surface")}>
                <input type="radio" name="card" className="accent-[var(--primary)]" checked={cardId === c.id} onChange={() => setCardId(c.id)} />
                <span className="flex-1 font-semibold">{cardName(c)}</span>
                <span className="text-xs text-muted-foreground">
                  {c.isDefault ? "Default · " : ""}exp {String(c.expMonth).padStart(2, "0")}/{String(c.expYear % 100).padStart(2, "0")}
                </span>
              </label>
            ))}
            <label className={cn("flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm", cardId === NEW_CARD ? "border-primary bg-primary/10" : "border-border bg-surface")}>
              <input type="radio" name="card" className="accent-[var(--primary)]" checked={cardId === NEW_CARD} onChange={() => setCardId(NEW_CARD)} />
              <span className="font-semibold">Use a different card</span>
            </label>
            {cardId === NEW_CARD && (
              <div className="rounded-md border border-border bg-surface p-3">
                <p className="mb-3 text-xs text-muted-foreground">Enter the new card. It's saved to your account and used for this upgrade.</p>
                <StripeSetupBox onSaved={() => void qc.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY })} />
              </div>
            )}
          </fieldset>
        )}

        {p && (
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 text-xs text-soft">
            <input type="checkbox" className="mt-0.5 shrink-0 accent-[var(--primary)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              {kind === "upgrade"
                ? p.chargeToday > 0
                  ? `I agree to be charged about ${usd(p.chargeToday, p.currency)} today on the card selected above, and ${usd(p.toPlan.priceAmount, p.currency)} each ${per(p.toPlan.billingInterval)} from my next renewal until I cancel.`
                  : `I agree to upgrade now. My credit covers today's cost, and ${usd(p.toPlan.priceAmount, p.currency)} will be charged each ${per(p.toPlan.billingInterval)} from my next renewal until I cancel.`
                : `I understand my plan changes now, that about ${usd(p.creditAdded, p.currency)} is kept as credit toward my next invoice, and that unused time is not refunded to my card.`}{" "}
              I accept the Terms &amp; Conditions and the Refund Policy.
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <LegalLinks lead="Read our" />
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn variant="primary" disabled={!canConfirm || !chosen} onClick={() => void confirm()}>
            {busy ? "Working…" : kind === "upgrade" ? (p ? (p.chargeToday > 0 ? `Pay ${usd(p.chargeToday, p.currency)} and upgrade` : "Upgrade now") : "Confirm upgrade") : "Confirm downgrade"}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}
