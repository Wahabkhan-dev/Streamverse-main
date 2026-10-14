import { ShieldCheck } from "lucide-react";
import { useId, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BILLING_COUNTRIES,
  addPaymentMethod,
  detectBrand,
  digitsOf,
  emptyCardForm,
  formatCardNumber,
  formatExpiry,
  usePaymentMethods,
  validateCardForm,
  type CardErrors,
  type CardForm,
} from "@/lib/payment-methods";
import { cn } from "@/lib/utils";
import { LegalLinks } from "./LegalLinks";
import { Btn, inputCls } from "./ui";

/** A labelled input whose error is announced and tied to the input with aria-describedby. */
function CardField({ id, label, error, hint, children }: { id: string; label: string; error?: string | undefined; hint?: string; children: (a: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode }) {
  const msgId = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-soft">
        {label}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": error || hint ? msgId : undefined })}
      {error ? (
        <p id={msgId} role="alert" className="mt-1 text-[11px] font-medium text-primary-text">
          {error}
        </p>
      ) : (
        hint && (
          <p id={msgId} className="mt-1 text-[11px] text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/**
 * Add a payment method (frontend phase).
 * The card number and CVC live only in this dialog's state while it is open. On save they are checked,
 * reduced to brand / last four / expiry by `addPaymentMethod`, and the form is cleared. Nothing sensitive
 * is stored. A payment provider's hosted fields replace these inputs once one is connected.
 */
export function AddPaymentMethodDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const uid = useId();
  const cards = usePaymentMethods();
  const first = cards.length === 0;
  const [form, setForm] = useState<CardForm>(emptyCardForm);
  const [shown, setShown] = useState<Set<keyof CardForm>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [dup, setDup] = useState(false);

  const live: CardErrors = validateCardForm(form);
  const errors: CardErrors = {};
  for (const k of Object.keys(live) as (keyof CardForm)[]) {
    const msg = live[k];
    if (msg && (submitted || shown.has(k))) errors[k] = msg;
  }
  if (dup && !errors.cardNumber) errors.cardNumber = "This card is already saved.";

  const set = <K extends keyof CardForm>(k: K, v: CardForm[K]) => {
    setDup(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const blur = (k: keyof CardForm) => setShown((s) => new Set(s).add(k));
  const fid = (k: keyof CardForm) => `${uid}-${k}`;

  function close(next: boolean) {
    if (!next) {
      setForm(emptyCardForm);
      setShown(new Set());
      setSubmitted(false);
      setDup(false);
    }
    onOpenChange(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const bad = Object.keys(live) as (keyof CardForm)[];
    if (bad.length) {
      document.getElementById(fid(bad[0]!))?.focus();
      return;
    }
    const res = addPaymentMethod({ ...form, makeDefault: first || form.makeDefault });
    if (!res.ok) {
      setDup(true);
      document.getElementById(fid("cardNumber"))?.focus();
      return;
    }
    toast.success(`${detectBrand(digitsOf(form.cardNumber))} card added`);
    close(false);
  }

  const brand = detectBrand(digitsOf(form.cardNumber));
  const invalid = (k: keyof CardForm) => (errors[k] ? "border-primary" : "");

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-surface-2 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add payment method</DialogTitle>
          <DialogDescription>Enter the card you would like to use for your subscription.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <CardField id={fid("holderName")} label="Name on card" error={errors.holderName}>
            {(a) => <input {...a} value={form.holderName} autoComplete="cc-name" placeholder="Full name" onChange={(e) => set("holderName", e.target.value)} onBlur={() => blur("holderName")} className={cn(inputCls, invalid("holderName"))} />}
          </CardField>
          <CardField id={fid("cardNumber")} label={brand !== "Card" ? `Card number (${brand})` : "Card number"} error={errors.cardNumber}>
            {(a) => (
              <input
                {...a}
                value={form.cardNumber}
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 1234 1234 1234"
                onChange={(e: ChangeEvent<HTMLInputElement>) => set("cardNumber", formatCardNumber(e.target.value))}
                onBlur={() => blur("cardNumber")}
                className={cn(inputCls, invalid("cardNumber"))}
              />
            )}
          </CardField>
          <div className="grid grid-cols-2 gap-3">
            <CardField id={fid("expiry")} label="Expiry" error={errors.expiry}>
              {(a) => <input {...a} value={form.expiry} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" maxLength={5} onChange={(e) => set("expiry", formatExpiry(e.target.value))} onBlur={() => blur("expiry")} className={cn(inputCls, invalid("expiry"))} />}
            </CardField>
            <CardField id={fid("cvc")} label="CVC" error={errors.cvc}>
              {(a) => <input {...a} value={form.cvc} inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} onChange={(e) => set("cvc", digitsOf(e.target.value).slice(0, 4))} onBlur={() => blur("cvc")} className={cn(inputCls, invalid("cvc"))} />}
            </CardField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CardField id={fid("country")} label="Billing country" error={errors.country}>
              {(a) => (
                <select {...a} value={form.country} autoComplete="country-name" onChange={(e) => set("country", e.target.value)} onBlur={() => blur("country")} className={cn(inputCls, "appearance-none", invalid("country"))}>
                  <option value="">Choose a country</option>
                  {BILLING_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </CardField>
            <CardField id={fid("postalCode")} label="ZIP / postal code" error={errors.postalCode}>
              {(a) => <input {...a} value={form.postalCode} autoComplete="postal-code" placeholder="e.g. 94103" onChange={(e) => set("postalCode", e.target.value)} onBlur={() => blur("postalCode")} className={cn(inputCls, invalid("postalCode"))} />}
            </CardField>
          </div>

          {first ? (
            <p className="text-xs text-muted-foreground">This will be your default payment method.</p>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.makeDefault} onChange={(e) => set("makeDefault", e.target.checked)} className="size-4 accent-[var(--primary)]" />
              Set as default payment method
            </label>
          )}

          <p className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary-text" aria-hidden />
            <span>StreamVerse never keeps your full card number or security code. In this preview only the card type, last four digits, expiry, name and country are saved, in this browser.</span>
          </p>
          <LegalLinks lead="By adding a card you agree to our" />

          <div className="flex flex-wrap justify-end gap-2">
            <Btn type="button" onClick={() => close(false)}>
              Cancel
            </Btn>
            <Btn type="submit" variant="primary">
              Add payment method
            </Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
