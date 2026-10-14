import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privacyPolicy, refundPolicy, termsAndConditions } from "@/lib/legal-content";
import { addPaymentMethod, detectBrand, emptyCardForm, expiryProblem, formatCardNumber, formatExpiry, luhnValid, removalBlock, validateCardForm, type SavedCard } from "@/lib/payment-methods";
import { getUser, updateUser } from "@/lib/user";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

const cards = () => getUser().paymentMethods;
const list = () => screen.getByRole("list", { name: "Saved payment methods" });

describe("card helpers", () => {
  it("detects brands, checks the Luhn sum and formats input", () => {
    expect(detectBrand("4242424242424242")).toBe("Visa");
    expect(detectBrand("5555555555554444")).toBe("Mastercard");
    expect(detectBrand("378282246310005")).toBe("American Express");
    expect(detectBrand("6011111111111117")).toBe("Discover");
    expect(luhnValid("4242424242424242")).toBe(true);
    expect(luhnValid("4242424242424241")).toBe(false);
    expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
    expect(formatExpiry("0829")).toBe("08/29");
  });

  it("rejects bad expiries, expired cards and the wrong CVC length", () => {
    const now = new Date(2026, 9, 8);
    expect(expiryProblem("13/30", now)).toMatch(/valid month/);
    expect(expiryProblem("01/20", now)).toMatch(/expired/);
    expect(expiryProblem("0830", now)).toMatch(/MM\/YY/);
    expect(expiryProblem("08/29", now)).toBeNull();
    const ok = { holderName: "Alex Morgan", cardNumber: "4242 4242 4242 4242", expiry: "08/29", cvc: "123", country: "United States", postalCode: "94103", makeDefault: false };
    expect(validateCardForm(ok, now)).toEqual({});
    expect(validateCardForm({ ...ok, cvc: "12" }, now).cvc).toBeTruthy();
    expect(validateCardForm({ ...ok, cardNumber: "3782 822463 10005", cvc: "123" }, now).cvc).toMatch(/4 digit/);
    expect(Object.keys(validateCardForm(emptyCardForm, now))).toHaveLength(6);
  });

  it("applies the removal rules", () => {
    const a: SavedCard = { id: "a", brand: "Visa", last4: "4242", expMonth: 8, expYear: 2028, isDefault: true };
    const b: SavedCard = { id: "b", brand: "Mastercard", last4: "5521", expMonth: 3, expYear: 2030, isDefault: false };
    expect(removalBlock([a, b], "a", true)).toBe("default");
    expect(removalBlock([a, b], "b", true)).toBeNull();
    expect(removalBlock([a], "a", true)).toBe("last-active");
    expect(removalBlock([a], "a", false)).toBeNull();
  });
});

describe("payment methods page", () => {
  it("lists the saved cards with masked numbers, expiry and a single Default", async () => {
    renderAt("/payment-methods");
    await screen.findByRole("heading", { level: 1, name: "Payment methods" });
    const items = within(list()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toMatch(/Visa/);
    expect(items[0]!.textContent).toMatch(/4242/);
    expect(items[0]!.textContent).toMatch(/Expires 08\/28/);
    expect(items[0]!.textContent).toContain("Alex Morgan");
    expect(screen.getAllByText("Default")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add payment method" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d{4} \d{4} \d{4}/);
  });

  it("Set as default moves the Default tag, and Subscription shows the new default", async () => {
    const page = renderAt("/payment-methods");
    await screen.findByRole("heading", { level: 1, name: "Payment methods" });
    expect(screen.queryByRole("button", { name: /Set as default: Visa/ })).toBeNull();
    act(() => screen.getByRole("button", { name: "Set as default: Mastercard ending in 5521" }).click());
    await waitFor(() => expect(cards().filter((c) => c.isDefault).map((c) => c.brand)).toEqual(["Mastercard"]));
    expect(screen.getAllByText("Default")).toHaveLength(1);
    page.unmount();
    renderAt("/subscription");
    await screen.findByText(/Mastercard •••• 5521 \(exp 03\/30\)/);
    expect(screen.getByRole("link", { name: /Manage payment methods/ }).getAttribute("href")).toBe("/payment-methods");
  });

  it("explains why the default card cannot be removed", async () => {
    renderAt("/payment-methods");
    await screen.findByRole("heading", { level: 1, name: "Payment methods" });
    expect((screen.getByRole("button", { name: "Remove Visa ending in 4242" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(list()).getAllByRole("listitem")[0]!.textContent).toMatch(/Make another card the default before removing it/);
    expect((screen.getByRole("button", { name: "Remove Mastercard ending in 5521" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("warns about the last card while a subscription is active, and allows it otherwise", async () => {
    act(() => updateUser((s) => ({ ...s, paymentMethods: s.paymentMethods.slice(0, 1) })));
    const page = renderAt("/payment-methods");
    await screen.findByRole("heading", { level: 1, name: "Payment methods" });
    expect((screen.getByRole("button", { name: /^Remove Visa/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You need at least one payment method for your active subscription.")).toBeTruthy();
    expect(screen.getAllByText(/payment provider and a server/).length).toBeGreaterThan(0);
    page.unmount();
    act(() => updateUser((s) => ({ ...s, subscription: { ...s.subscription, status: "canceled" } })));
    renderAt("/payment-methods");
    await screen.findByRole("heading", { level: 1, name: "Payment methods" });
    expect((screen.getByRole("button", { name: /^Remove Visa/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows an intentional empty state, not blank cards", async () => {
    act(() => updateUser((s) => ({ ...s, paymentMethods: [] })));
    renderAt("/payment-methods");
    expect(await screen.findByText("No payment methods saved")).toBeTruthy();
    expect(screen.getByText(/Add a payment method to manage your subscription/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Saved payment methods" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Add payment method/ }).length).toBeGreaterThan(1);
  });

  it("Subscription says 'no payment method' instead of showing fake data when none is saved", async () => {
    act(() => updateUser((s) => ({ ...s, paymentMethods: [] })));
    renderAt("/subscription");
    expect(await screen.findByText("No payment method saved")).toBeTruthy();
  });
});

describe("what is stored", () => {
  it("keeps only safe display data: never the card number or the CVC", () => {
    const res = addPaymentMethod({ holderName: "Alex Morgan", cardNumber: "5555 5555 5555 4444", expiry: "12/30", cvc: "987", country: "Canada", postalCode: "M5V 2T6", makeDefault: true });
    expect(res.ok).toBe(true);
    const saved = cards().find((c) => c.last4 === "4444")!;
    expect(Object.keys(saved).sort()).toEqual(["brand", "country", "expMonth", "expYear", "holderName", "id", "isDefault", "last4"]);
    const raw = localStorage.getItem("sv-user-v1") ?? "";
    expect(raw).not.toContain("5555555555554444");
    expect(raw).not.toContain("5555 5555 5555 4444");
    expect(raw).not.toContain("987");
    expect(raw).not.toContain("M5V");
    expect(cards().filter((c) => c.isDefault)).toHaveLength(1);
    expect(addPaymentMethod({ holderName: "Alex", cardNumber: "5555555555554444", expiry: "12/30", cvc: "111", country: "Canada", postalCode: "M5V", makeDefault: false })).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("legal pages", () => {
  it.each([
    ["/privacy-policy", privacyPolicy],
    ["/terms-and-conditions", termsAndConditions],
    ["/refund-policy", refundPolicy],
  ])("%s renders its full content", async (path, doc) => {
    renderAt(path);
    await screen.findByRole("heading", { level: 1, name: doc.title });
    expect(document.querySelectorAll("article h2")).toHaveLength(doc.sections.length);
    expect(screen.getByRole("note").textContent).toMatch(/not been reviewed by a lawyer/);
    expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/lorem ipsum|HIPAA|SOC ?2|money-back|30-day|VoiceOS/i);
  });

  it("the footer groups its links and every one is real", async () => {
    renderAt("/");
    const footer = (await screen.findAllByRole("contentinfo"))[0]!;
    for (const [group, labels] of [
      ["Browse", ["Movies", "eBooks", "Audiobooks"]],
      ["Account", ["My List", "My Library", "Subscription", "Payment methods"]],
      ["Legal", ["Terms & Conditions", "Refund Policy", "Privacy Policy"]],
    ] as const) {
      const nav = within(footer).getByRole("navigation", { name: group });
      for (const l of labels) expect(within(nav).getByRole("link", { name: l })).toBeTruthy();
    }
    const hrefs = [...footer.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/privacy-policy");
    expect(hrefs).toContain("/terms-and-conditions");
    expect(hrefs).toContain("/refund-policy");
    expect(hrefs.filter((h) => !h || h === "#")).toHaveLength(0);
  });

  it("Subscription links to the three policies where someone subscribes", async () => {
    renderAt("/subscription");
    await screen.findByRole("heading", { level: 1, name: "Subscription" });
    const line = screen.getByText(/By subscribing, you agree to our Terms & Conditions/).closest("p")!;
    for (const [name, href] of [["Terms & Conditions", "/terms-and-conditions"], ["Refund Policy", "/refund-policy"], ["Privacy Policy", "/privacy-policy"]] as const) {
      expect(within(line).getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
  });
});
