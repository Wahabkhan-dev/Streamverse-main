import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { meApi } from "@/api/me.api";
import { isApiError } from "@/api/client";
import { syncSubscription } from "@/lib/billingSync";

export const BILLING_CHANNEL = "sv-billing";
const POLL_MS = 3000;
const GIVE_UP_AFTER_MS = 20 * 60_000;

/**
 * Pays on Stripe's own checkout page in a popup window. Stripe's page cuts the link between the two windows (so
 * `window.opener` / `closed` cannot be trusted), so this window finds out the way that always works: the popup's last page
 * announces on a same-site channel, and this window also asks the server every few seconds while the popup is open.
 */
export function StripePopupButton({ planId, onPaid, onProblem }: { planId: string; onPaid: () => void; onProblem: (msg: string) => void }) {
  const [waiting, setWaiting] = useState(false);
  const popup = useRef<Window | null>(null);
  const paid = useRef(onPaid);
  paid.current = onPaid;

  useEffect(() => {
    if (!waiting) return undefined;
    const started = Date.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setWaiting(false);
      paid.current();
    };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(BILLING_CHANNEL);
    if (channel) channel.onmessage = (e: MessageEvent) => (e.data as { type?: string } | null)?.type === "paid" && finish();
    const poll = window.setInterval(() => {
      if (Date.now() - started > GIVE_UP_AFTER_MS) return void setWaiting(false);
      void syncSubscription().then((active) => active && finish()).catch(() => undefined);
    }, POLL_MS);
    return () => {
      done = true;
      window.clearInterval(poll);
      channel?.close();
    };
  }, [waiting]);

  async function start() {
    if (waiting) {
      // pressed again while waiting: stop waiting and close the Stripe window
      popup.current?.close();
      return setWaiting(false);
    }
    onProblem("");
    // opened straight from the click so the browser allows it; pointed at Stripe once the session exists
    const w = window.open("", "streamverse-stripe", "popup=yes,width=520,height=760");
    if (!w) return onProblem("Your browser blocked the Stripe window. Allow pop-ups for this site, or pay in the box above.");
    popup.current = w;
    try {
      const { checkoutUrl } = (await meApi.checkout(planId, { popup: true })).data;
      w.location.href = checkoutUrl;
      setWaiting(true);
    } catch (err) {
      w.close();
      onProblem(isApiError(err) ? err.message : "Stripe could not be opened. Please try again.");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      data-testid="stripe-popup"
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-semibold text-soft transition hover:bg-surface-3 hover:text-foreground"
    >
      <ExternalLink className="size-4" />
      {waiting ? "Waiting for the Stripe window… (click to cancel)" : "Pay in a Stripe popup"}
    </button>
  );
}
