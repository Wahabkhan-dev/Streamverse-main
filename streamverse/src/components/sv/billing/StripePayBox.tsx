import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { meApi } from "@/api/me.api";
import { isApiError } from "@/api/client";
import { syncSubscription } from "@/lib/billingSync";
import { getStripe, STRIPE_APPEARANCE } from "@/lib/stripe";

/** Stripe confirms the charge a moment before the server's copy of the subscription turns active: wait for it briefly. */
async function waitUntilActive(): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    if (await syncSubscription().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function PayForm({ label, onPaid, onProblem }: { label: string; onPaid: () => void; onProblem: (msg: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    onProblem("");
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/signup/complete` },
    });
    if (error) {
      // Stripe's message for a declined/invalid card is written for the customer ("Your card was declined.")
      onProblem(error.message ?? "We couldn't complete your payment. Please check your details and try again.");
      setBusy(false);
      return;
    }
    if (await waitUntilActive()) onPaid();
    else {
      onProblem("Your payment is being confirmed. If your membership does not appear in a minute, refresh this page.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" data-testid="stripe-pay-form">
      <PaymentElement options={{ layout: "tabs" }} />
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? "Processing payment…" : label}
      </button>
    </form>
  );
}

/** The card box on our own page (Stripe Elements): the card details go straight to Stripe, never through StreamVerse. */
export function StripePayBox({ planId, label, onPaid, onProblem }: { planId: string; label: string; onPaid: () => void; onProblem: (msg: string) => void }) {
  const intent = useQuery({
    queryKey: ["billing", "payment-intent", planId],
    queryFn: async () => (await meApi.createPaymentIntent(planId)).data.clientSecret,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (intent.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-surface-3" aria-busy="true" />;
  if (intent.isError || !intent.data)
    return (
      <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400" role="alert">
        {isApiError(intent.error) ? intent.error.message : "The payment box could not be loaded. Please try again."}
      </p>
    );
  return (
    <Elements stripe={getStripe()} options={{ clientSecret: intent.data, appearance: STRIPE_APPEARANCE }}>
      <PayForm label={label} onPaid={onPaid} onProblem={onProblem} />
    </Elements>
  );
}
