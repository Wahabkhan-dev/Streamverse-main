import { expect, test, type Page } from "@playwright/test";

/**
 * Real Stripe TEST-mode payments in a real browser (the embedded payment box and the Stripe popup), against the real API.
 * Needs STRIPE_SECRET_KEY (sk_test_) in the backend and VITE_STRIPE_PUBLISHABLE_KEY (pk_test_) in the frontend.
 */
const API = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";
const PLAN_KEY = "sv-signup-plan";

async function newCustomerOnPaymentStep(page: Page, tag: string) {
  const creds = { email: `pay-${tag}-${Date.now()}@streamverse.test`, password: "Pay-Tester-Pass-1!", fullName: "Pay Tester" };
  const res = await fetch(`${API}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
  expect(res.status).toBe(201);
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(creds.email);
  await page.getByLabel("Password", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await page.evaluate((k) => sessionStorage.setItem(k, "Basic"), PLAN_KEY);
  await page.goto("/signup/payment");
}

async function fillCard(page: Page, number: string) {
  const frame = page.frameLocator('iframe[title*="Secure payment input"]').first();
  await frame.getByLabel("Card number").fill(number);
  await frame.getByLabel("Expiration date").fill("12 / 34");
  await frame.getByLabel("Security code").fill("123");
  const zip = frame.getByLabel(/ZIP|Postal/i);
  if (await zip.count()) await zip.fill("12345");
}

test("the payment box on the page pays with a Stripe test card and activates the membership", async ({ page }) => {
  test.setTimeout(120_000);
  await newCustomerOnPaymentStep(page, "ok");
  await expect(page.getByTestId("stripe-pay-form")).toBeVisible({ timeout: 30_000 });
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(page).toHaveURL(/\/signup\/complete/, { timeout: 60_000 });
  await expect(page.getByText("Your membership is now active")).toBeVisible();
  await expect(page.getByText("Basic")).toBeVisible();
});

test("a declined card shows Stripe's message and stays on the payment step", async ({ page }) => {
  test.setTimeout(120_000);
  await newCustomerOnPaymentStep(page, "declined");
  await expect(page.getByTestId("stripe-pay-form")).toBeVisible({ timeout: 30_000 });
  await fillCard(page, "4000000000000002");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(page.getByText(/declined/i).first()).toBeVisible({ timeout: 30_000 });
  expect(page.url()).toContain("/signup/payment");
});

test("the Stripe popup pays on Stripe's checkout and this page moves on by itself", async ({ page, context }) => {
  test.setTimeout(180_000);
  await newCustomerOnPaymentStep(page, "popup");
  await expect(page.getByTestId("stripe-popup")).toBeVisible({ timeout: 30_000 });
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByTestId("stripe-popup").click()]);
  await popup.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await popup.getByPlaceholder("1234 1234 1234 1234").fill("4242424242424242");
  await popup.getByPlaceholder("MM / YY").fill("12 / 34");
  await popup.getByPlaceholder("CVC").fill("123");
  await popup.getByPlaceholder("Full name on card").fill("Pay Tester");
  const zip = popup.getByPlaceholder(/ZIP|Postal/i);
  if (await zip.count()) await zip.fill("12345");
  await popup.getByTestId("hosted-payment-submit-button").click();
  // the popup returns to StreamVerse and closes; the original page notices and shows the welcome page
  await expect(page).toHaveURL(/\/signup\/complete/, { timeout: 90_000 });
  await expect(page.getByText("Your membership is now active")).toBeVisible();
  // the Stripe window finishes its own return trip to StreamVerse and closes itself
  await expect.poll(() => popup.isClosed(), { timeout: 30_000 }).toBe(true);
});

test("a card is added on the Payment methods page in a Stripe box and then listed", async ({ page }) => {
  test.setTimeout(120_000);
  await newCustomerOnPaymentStep(page, "card");
  await page.goto("/payment-methods");
  await expect(page.getByText("No payment methods saved")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("add-card").first().click();
  await expect(page.getByTestId("stripe-setup-form")).toBeVisible({ timeout: 30_000 });
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText("visa ending in 4242", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Default")).toBeVisible();
});
