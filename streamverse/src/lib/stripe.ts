import { loadStripe, type Stripe } from "@stripe/stripe-js";

/** Stripe.js is loaded once, and only when a payment box is actually opened. The publishable key is public by design. */
const publishableKey = import.meta.env["VITE_STRIPE_PUBLISHABLE_KEY"] as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;
export const getStripe = () => (publishableKey ? (stripePromise ??= loadStripe(publishableKey)) : null);
export const stripeConfigured = Boolean(publishableKey);

export const STRIPE_APPEARANCE = {
  theme: "night" as const,
  variables: { colorPrimary: "#e50914", borderRadius: "8px" },
};
