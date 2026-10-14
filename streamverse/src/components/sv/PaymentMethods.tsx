import { Link } from "@tanstack/react-router";
import { CreditCard, Lock, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  cardLabel,
  expiryLabel,
  isExpired,
  removalBlock,
  removePaymentMethod,
  setDefaultPaymentMethod,
  usePaymentMethods,
  type SavedCard,
} from "@/lib/payment-methods";
import { useSubscription } from "@/lib/user";
import { BackendBadge } from "./BackendNotice";
import { LegalLinks } from "./LegalLinks";
import { AddPaymentMethodDialog } from "./PaymentMethodDialog";
import { Btn, ConfirmDialog, EmptyState, Panel, PanelHeader, Tag } from "./ui";

/** "Visa •••• 4242" to the eye, "Visa ending in 4242" to a screen reader. */
export function CardTitle({ card }: { card: SavedCard }) {
  return (
    <span className="text-sm font-semibold">
      {card.brand} <span aria-hidden="true">••••</span>
      <span className="sr-only"> ending in </span> {card.last4}
    </span>
  );
}

function CardRow({ card, list, subscriptionActive, onRemove }: { card: SavedCard; list: SavedCard[]; subscriptionActive: boolean; onRemove: (c: SavedCard) => void }) {
  const block = removalBlock(list, card.id, subscriptionActive);
  const helpId = `pm-help-${card.id}`;
  const detail = [card.holderName, card.country].filter(Boolean).join(" · ");
  return (
    <li className="rounded-lg border border-border bg-surface-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-3 text-soft">
          <CreditCard className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 basis-44">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle card={card} />
            {card.isDefault && <Tag tone="red">Default</Tag>}
            {isExpired(card) && <Tag tone="outline">Expired</Tag>}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Expires {expiryLabel(card)}
            {detail ? ` · ${detail}` : ""}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {!card.isDefault && (
            <Btn
              size="sm"
              aria-label={`Set as default: ${cardLabel(card)}`}
              onClick={() => {
                setDefaultPaymentMethod(card.id);
                toast.success(`${cardLabel(card)} is now your default`);
              }}
            >
              Set as default
            </Btn>
          )}
          <Btn size="sm" disabled={!!block} aria-describedby={block ? helpId : undefined} aria-label={`Remove ${cardLabel(card)}`} onClick={() => onRemove(card)}>
            <Trash2 aria-hidden /> Remove
          </Btn>
        </div>
      </div>
      {block && (
        <p id={helpId} className="mt-2 text-xs text-muted-foreground">
          {block === "last-active" ? "You need at least one payment method for your active subscription." : "This is your default payment method. Make another card the default before removing it."}
        </p>
      )}
    </li>
  );
}

/** The saved cards, their actions, the empty state and the remove confirmation. */
export function PaymentMethodsManager() {
  const cards = usePaymentMethods();
  const sub = useSubscription();
  const active = sub.status === "active" || sub.status === "past_due";
  const [addOpen, setAddOpen] = useState(false);
  const [pending, setPending] = useState<SavedCard | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const removed = useRef(false);

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
          <Btn variant="primary" onClick={() => setAddOpen(true)}>
            <Plus /> Add payment method
          </Btn>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {cards.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payment methods saved"
              sub="Add a payment method to manage your subscription and future charges."
              action={
                <Btn variant="primary" onClick={() => setAddOpen(true)}>
                  <Plus /> Add payment method
                </Btn>
              }
            />
          ) : (
            <Panel className="p-4 sm:p-5">
              <ul ref={listRef} tabIndex={-1} aria-label="Saved payment methods" className="space-y-3 outline-none">
                {cards.map((c) => (
                  <CardRow key={c.id} card={c} list={cards} subscriptionActive={active} onRemove={setPending} />
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-4">
          <Panel>
            <PanelHeader title="How your card details are handled" />
            <div className="space-y-3 p-5 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
                <span>Only the card type, last four digits, expiry, name and country are shown. Your full card number and security code are never saved.</span>
              </p>
              <p>
                <strong className="text-foreground">Replacing a card:</strong> add the new card, set it as default, then remove the old one.
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <BackendBadge />
                <span className="text-xs">Charging cards and enforcing these rules needs a payment provider and a server.</span>
              </p>
              <LegalLinks lead="See our" />
            </div>
          </Panel>
        </aside>
      </div>

      <AddPaymentMethodDialog open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Remove payment method?"
        description={pending ? `${cardLabel(pending)} will be removed from your account. You can add it again at any time.` : ""}
        confirmLabel="Remove"
        // the card's own Remove button is gone afterwards, so keyboard focus goes to the list instead
        onCloseAutoFocus={(e) => {
          if (removed.current && listRef.current) {
            e.preventDefault();
            listRef.current.focus();
          }
          removed.current = false;
        }}
        onConfirm={() => {
          if (pending && removePaymentMethod(pending.id, active)) {
            removed.current = true;
            toast.success("Payment method removed");
          }
          setPending(null);
        }}
      />
    </div>
  );
}
