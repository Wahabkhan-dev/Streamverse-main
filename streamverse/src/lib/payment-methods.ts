import { getUser, updateUser, useUser } from "./user";

/**
 * Saved payment methods (frontend phase).
 *
 * A saved card is only what a payment provider would hand back for display: brand, last four digits,
 * expiry, and the name and country entered. The full card number and the security code (CVC) are used
 * to validate the add-card form and then discarded; they are never written to this store, to local
 * storage, or to anything shaped like an API payload. Real card entry moves to the provider's hosted
 * fields once a backend and provider exist, and this list becomes a client over their API.
 */

export type CardBrand = "Visa" | "Mastercard" | "American Express" | "Discover" | "Card";

export type SavedCard = {
  id: string;
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName?: string;
  country?: string;
  isDefault: boolean;
};

export const BILLING_COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Ireland",
  "Australia",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "United Arab Emirates",
  "Saudi Arabia",
  "India",
  "Pakistan",
  "Singapore",
];

/* ------------------------------------------------------------------ card helpers (display + form validation only) */

export const digitsOf = (v: string) => v.replace(/\D/g, "");

export function detectBrand(digits: string): CardBrand {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]|[3-6]|7[01]|720))/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "American Express";
  if (/^(6011|65|64[4-9])/.test(digits)) return "Discover";
  return "Card";
}

/** Standard Luhn checksum: catches typos, does not prove a card exists. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function formatCardNumber(raw: string): string {
  const d = digitsOf(raw).slice(0, 19);
  if (detectBrand(d) === "American Express") return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
  return d.replace(/(.{4})/g, "$1 ").trim();
}

export function formatExpiry(raw: string): string {
  const d = digitsOf(raw).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** A message when the MM/YY value is not a real, unexpired month; otherwise null. */
export function expiryProblem(value: string, now = new Date()): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!m) return "Use the format MM/YY.";
  const month = Number(m[1]);
  if (month < 1 || month > 12) return "Enter a valid month (01 to 12).";
  if (new Date(2000 + Number(m[2]), month, 0, 23, 59, 59) < now) return "This card has expired.";
  return null;
}

export const isExpired = (c: Pick<SavedCard, "expMonth" | "expYear">, now = new Date()) => new Date(c.expYear, c.expMonth, 0, 23, 59, 59) < now;
export const expiryLabel = (c: Pick<SavedCard, "expMonth" | "expYear">) => `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear % 100).padStart(2, "0")}`;
/** "Visa ending in 4242": how a card is named in prose and for screen readers. */
export const cardLabel = (c: Pick<SavedCard, "brand" | "last4">) => `${c.brand} ending in ${c.last4}`;

/* ------------------------------------------------------------------ add-card form */

export type CardForm = { holderName: string; cardNumber: string; expiry: string; cvc: string; country: string; postalCode: string; makeDefault: boolean };
export const emptyCardForm: CardForm = { holderName: "", cardNumber: "", expiry: "", cvc: "", country: "", postalCode: "", makeDefault: false };
export type CardErrors = Partial<Record<keyof CardForm, string>>;

export function validateCardForm(f: CardForm, now = new Date()): CardErrors {
  const e: CardErrors = {};
  if (f.holderName.trim().length < 2) e.holderName = "Enter the name shown on the card.";
  const digits = digitsOf(f.cardNumber);
  if (!digits) e.cardNumber = "Enter the card number.";
  else if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) e.cardNumber = "Enter a valid card number.";
  const exp = expiryProblem(f.expiry, now);
  if (!f.expiry) e.expiry = "Enter the expiry date (MM/YY).";
  else if (exp) e.expiry = exp;
  const need = detectBrand(digits) === "American Express" ? 4 : 3;
  if (!f.cvc) e.cvc = "Enter the security code.";
  else if (!/^\d{3,4}$/.test(f.cvc)) e.cvc = "Enter the 3 or 4 digit security code.";
  else if (f.cvc.length !== need) e.cvc = `${detectBrand(digits) === "Card" ? "This card" : detectBrand(digits)} uses a ${need} digit security code.`;
  if (!f.country) e.country = "Choose the billing country.";
  if (f.postalCode.trim().length < 3) e.postalCode = "Enter the ZIP or postal code.";
  else if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(f.postalCode.trim())) e.postalCode = "Use letters, numbers, spaces or hyphens only.";
  return e;
}

/* ------------------------------------------------------------------ store actions */

export const usePaymentMethods = () => useUser((s) => s.paymentMethods);
export const defaultCardOf = (list: SavedCard[]) => list.find((c) => c.isDefault) ?? list[0];

export type AddCardResult = { ok: true; id: string } | { ok: false; reason: "duplicate" };

/** Reduces a validated form to a safe display record and saves it. The number and CVC go no further. */
export function addPaymentMethod(f: CardForm): AddCardResult {
  const digits = digitsOf(f.cardNumber);
  const [mm, yy] = f.expiry.split("/");
  const list = getUser().paymentMethods;
  const card: SavedCard = {
    id: `pm-${Date.now().toString(36)}`,
    brand: detectBrand(digits),
    last4: digits.slice(-4),
    expMonth: Number(mm),
    expYear: 2000 + Number(yy),
    holderName: f.holderName.trim(),
    country: f.country,
    isDefault: list.length === 0 || f.makeDefault,
  };
  if (list.some((c) => c.brand === card.brand && c.last4 === card.last4 && c.expMonth === card.expMonth && c.expYear === card.expYear)) return { ok: false, reason: "duplicate" };
  updateUser((s) => ({ ...s, paymentMethods: [...s.paymentMethods.map((c) => (card.isDefault ? { ...c, isDefault: false } : c)), card] }));
  return { ok: true, id: card.id };
}

export function setDefaultPaymentMethod(id: string) {
  updateUser((s) => ({ ...s, paymentMethods: s.paymentMethods.map((c) => ({ ...c, isDefault: c.id === id })) }));
}

export type RemovalBlock = "default" | "last-active";
/**
 * Why a card cannot be removed right now, or null.
 * The default card pays the subscription, so another must be made default first. The last card cannot
 * go while the subscription is active. (A server and payment provider must enforce this for real.)
 */
export function removalBlock(list: SavedCard[], id: string, subscriptionActive: boolean): RemovalBlock | null {
  const target = list.find((c) => c.id === id);
  if (!target) return null;
  if (list.length === 1) return subscriptionActive ? "last-active" : null;
  return target.isDefault ? "default" : null;
}

export function removePaymentMethod(id: string, subscriptionActive: boolean): boolean {
  if (removalBlock(getUser().paymentMethods, id, subscriptionActive)) return false;
  updateUser((s) => ({ ...s, paymentMethods: s.paymentMethods.filter((c) => c.id !== id) }));
  return true;
}
