import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/api/client";
import type { ApiPaymentMethod } from "@/api/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PAYMENT_METHODS_QUERY_KEY, useApiPaymentMethodsQuery, useDeletePaymentMethodMutation, useSetDefaultPaymentMethodMutation } from "@/hooks/useApiSubscription";
import { StripeSetupBox } from "./billing/StripeSetupBox";
import { Btn, ConfirmDialog, EmptyState, Panel, Skel, Tag } from "./ui";

const label = (c: ApiPaymentMethod) => `${c.brand} ending in ${c.last4}`;
const message = (e: unknown) => (isApiError(e) ? e.message : "Something went wrong. Please try again.");

/** Payment methods in live mode: the cards are the customer's real ones in Stripe; adding one happens in a Stripe box. */
export function LivePaymentMethods() {
  const qc = useQueryClient();
  const cards = useApiPaymentMethodsQuery();
  const makeDefault = useSetDefaultPaymentMethodMutation();
  const remove = useDeletePaymentMethodMutation();
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<ApiPaymentMethod | null>(null);
  const list = cards.data ?? [];

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment methods</h1>
          <p className="mt-1 text-sm text-muted-foreground">The cards used for your subscription.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/subscription" className="inline-flex h-10 items-center rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3">
            Back to subscription
          </Link>
          <Btn variant="primary" onClick={() => setAdding(true)} data-testid="add-card">
            <Plus /> Add payment method
          </Btn>
        </div>
      </div>

      <div className="mt-6 max-w-2xl">
        {cards.isLoading ? (
          <Skel className="h-20 w-full" />
        ) : cards.isError ? (
          <EmptyState icon={CreditCard} title="Your cards could not be loaded" sub={message(cards.error)} action={<Btn onClick={() => void cards.refetch()}>Try again</Btn>} />
        ) : list.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payment methods saved" sub="Add a payment method to manage your subscription and future charges." />
        ) : (
          <Panel className="p-4 sm:p-5">
            <ul aria-label="Saved payment methods" className="space-y-3">
              {list.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 sm:p-4">
                  <div className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-3 text-soft">
                    <CreditCard className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 basis-44">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {label(c)} {c.isDefault && <Tag tone="red">Default</Tag>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Expires {String(c.expMonth).padStart(2, "0")}/{c.expYear}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!c.isDefault && (
                      <Btn size="sm" aria-label={`Set as default: ${label(c)}`} onClick={() => makeDefault.mutate(c.id, { onSuccess: () => toast.success(`${label(c)} is now your default`), onError: (e) => toast.error(message(e)) })}>
                        Set as default
                      </Btn>
                    )}
                    <Btn size="sm" aria-label={`Remove ${label(c)}`} onClick={() => setPending(c)}>
                      <Trash2 aria-hidden /> Remove
                    </Btn>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-surface-2 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add payment method</DialogTitle>
            <DialogDescription>Your card goes straight to Stripe. StreamVerse never sees the number.</DialogDescription>
          </DialogHeader>
          {adding && (
            <StripeSetupBox
              onSaved={() => {
                setAdding(false);
                toast.success("Card saved");
                void qc.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Remove this card?"
        description={pending ? `${label(pending)} will be removed from your account. You can add it again at any time.` : ""}
        confirmLabel="Remove"
        onConfirm={() => {
          if (pending) remove.mutate(pending.id, { onSuccess: () => toast.success("Card removed"), onError: (e) => toast.error(message(e)) });
          setPending(null);
        }}
      />
    </div>
  );
}
