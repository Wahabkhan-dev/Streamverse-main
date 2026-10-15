# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Auth — Login >> loads login page
- Location: e2e\auth.spec.ts:4:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/sign-in
Call log:
  - navigating to "http://localhost:5173/sign-in", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Auth — Login", () => {
  4  |   test("loads login page", async ({ page }) => {
> 5  |     await page.goto("/sign-in");
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/sign-in
  6  |     await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  7  |   });
  8  | 
  9  |   test("shows validation for empty fields", async ({ page }) => {
  10 |     await page.goto("/sign-in");
  11 |     await page.getByRole("button", { name: /sign in/i }).click();
  12 |     // Email/password required
  13 |     await expect(page.locator("input[type=email]:invalid, [data-error]").first())
  14 |       .toBeVisible()
  15 |       .catch(() => {
  16 |         // Some forms show custom error messages
  17 |       });
  18 |   });
  19 | 
  20 |   test("shows error for wrong password (demo mode)", async ({ page }) => {
  21 |     await page.goto("/sign-in");
  22 |     await page.getByLabel(/email/i).fill("test@example.com");
  23 |     await page.getByLabel(/password/i).fill("wrongpassword");
  24 |     await page.getByRole("button", { name: /sign in/i }).click();
  25 |     // In demo mode, accepts any credentials or shows specific demo behavior
  26 |     // Just verify no crash
  27 |     await page.waitForTimeout(1000);
  28 |     await expect(page).not.toHaveURL(/\/error/);
  29 |   });
  30 | 
  31 |   test("forgot password link is visible", async ({ page }) => {
  32 |     await page.goto("/sign-in");
  33 |     await expect(page.getByRole("link", { name: /forgot/i })).toBeVisible();
  34 |   });
  35 | });
  36 | 
  37 | test.describe("Auth — Signup", () => {
  38 |   test("loads plan selection page", async ({ page }) => {
  39 |     await page.goto("/signup");
  40 |     await expect(page).toHaveURL(/signup/);
  41 |     // Plans should load
  42 |     await page.waitForTimeout(1000);
  43 |     await expect(page.locator("body")).not.toContainText("Something went wrong");
  44 |   });
  45 | 
  46 |   test("loads account creation page", async ({ page }) => {
  47 |     await page.goto("/signup/account");
  48 |     // Should either redirect to plan selection or show account form
  49 |     await page.waitForTimeout(500);
  50 |     await expect(page).not.toHaveURL(/\/error/);
  51 |   });
  52 | });
  53 | 
  54 | test.describe("Auth — Forgot Password", () => {
  55 |   test("forgot password page loads", async ({ page }) => {
  56 |     await page.goto("/forgot-password");
  57 |     await expect(page.getByRole("heading").first()).toBeVisible();
  58 |   });
  59 | 
  60 |   test("email field accepts input", async ({ page }) => {
  61 |     await page.goto("/forgot-password");
  62 |     const emailInput = page.getByLabel(/email/i).first();
  63 |     await emailInput.fill("test@example.com");
  64 |     await expect(emailInput).toHaveValue("test@example.com");
  65 |   });
  66 | 
  67 |   test("reset password page handles missing token", async ({ page }) => {
  68 |     await page.goto("/reset-password");
  69 |     // Should show "invalid link" message when no token
  70 |     await expect(page.locator("body")).toContainText(/invalid|expired/i);
  71 |   });
  72 | 
  73 |   test("reset password page shows form with valid token", async ({ page }) => {
  74 |     await page.goto("/reset-password?token=testtoken123");
  75 |     // Should show the password reset form
  76 |     await expect(page.getByLabel(/new password/i).first()).toBeVisible();
  77 |   });
  78 | });
  79 | 
```