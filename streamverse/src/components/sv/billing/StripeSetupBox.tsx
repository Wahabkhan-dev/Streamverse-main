import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { meApi } from "@/api/me.api";
import { isApiError } from "@/api/client";
import { getStripe, STRIPE_APPEARANCE } from "@/lib/stripe";

function SetupForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setProblem("");
    const { error } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/payment-methods` },
    });
    if (error) {
      setProblem(error.message ?? "We could not save this card. Please check the details and try again.");
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" data-testid="stripe-setup-form">
      <PaymentElement options={{ layout: "tabs" }} />
      {problem && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {problem}
        </p>
      )}
      <button type="submit" disabled={!stripe || busy} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70">
        {busy ? "Saving card…" : "Save card"}
      </button>
    </form>
  );
}

/** Saves a card to the customer's Stripe account from a box on our page (Stripe Elements); no card data touches StreamVerse. */
export function StripeSetupBox({ onSaved }: { onSaved: () => void }) {
  const intent = useQuery({
    queryKey: ["billing", "setup-intent"],
    queryFn: async () => (await meApi.createSetupIntent()).data.clientSecret,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (intent.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-surface-3" aria-busy="true" />;
  if (intent.isError || !intent.data)
    return (
      <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {isApiError(intent.error) ? intent.error.message : "The card box could not be loaded. Please try again."}
      </p>
    );
  return (
    <Elements stripe={getStripe()} options={{ clientSecret: intent.data, appearance: STRIPE_APPEARANCE }}>
      <SetupForm onSaved={onSaved} />
    </Elements>
  );
}
