/**
 * Phase 7 (Section 71/72): amounts are always stored/passed as integer minor units (Stripe's own
 * convention — e.g. 1999 for $19.99), never a float. The handful of currencies with a different number
 * of minor-unit digits (JPY has 0, BHD has 3, ...) are the reason this is centralized instead of
 * assuming "divide by 100" everywhere a human-readable amount is needed.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
const THREE_DECIMAL_CURRENCIES = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function minorUnitDigits(currency: string): number {
  const lower = currency.toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(lower)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(lower)) return 3;
  return 2;
}

/** Minor units -> a plain decimal number for display (never used for arithmetic — do that in minor units). */
export function toDisplayAmount(amountMinor: number, currency: string): number {
  const digits = minorUnitDigits(currency);
  return amountMinor / 10 ** digits;
}
