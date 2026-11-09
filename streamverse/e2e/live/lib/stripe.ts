import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "./env";

/**
 * Stripe TEST-mode helpers for the live QA specs: confirm a payment the app created with a Stripe test card (the same
 * thing the payment box does in the browser), cancel a test subscription at Stripe, and replay a real Stripe event to the
 * app's webhook with a valid signature. Refuses to run with anything but an sk_test_ key.
 */
const here = dirname(fileURLToPath(import.meta.url));
function backendValue(name: string): string {
  const text = readFileSync(resolve(here, "../../../../streamverse-api/.env"), "utf8");
  const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  return (m?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
}
const secret = () => {
  const k = backendValue("STRIPE_SECRET_KEY");
  if (!k.startsWith("sk_test_")) throw new Error("stripe helper: STRIPE_SECRET_KEY is not a TEST key; refusing");
  return k;
};

export async function stripe<T = any>(method: "GET" | "POST" | "DELETE", path: string, form: Record<string, string> = {}): Promise<T> {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}${method === "GET" && body ? `?${body}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/x-www-form-urlencoded" },
    ...(method !== "GET" ? { body } : {}),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`stripe ${method} ${path} -> ${res.status} ${json.error?.message}`);
  return json;
}

/** The client secret the app returned (pi_..._secret_...) → confirm that PaymentIntent with a Stripe test card. */
export async function payWithTestCard(clientSecret: string, paymentMethod = "pm_card_visa") {
  const pi = clientSecret.split("_secret_")[0]!;
  return stripe("POST", `/payment_intents/${pi}/confirm`, { payment_method: paymentMethod });
}

/** Sends a real Stripe event (as Stripe would) to the app's webhook, signed with the app's webhook secret. */
export async function deliverWebhook(event: object): Promise<number> {
  const whsec = backendValue("STRIPE_WEBHOOK_SECRET");
  if (!whsec) throw new Error("stripe helper: STRIPE_WEBHOOK_SECRET is empty");
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", whsec).update(`${t}.${payload}`).digest("hex");
  const res = await fetch(`${API}/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${t},v1=${v1}` }, body: payload });
  return res.status;
}
