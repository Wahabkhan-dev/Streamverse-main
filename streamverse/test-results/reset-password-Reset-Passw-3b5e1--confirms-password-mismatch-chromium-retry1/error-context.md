# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: reset-password.spec.ts >> Reset Password Flow (UI) >> reset-password confirms password mismatch
- Location: e2e\reset-password.spec.ts:35:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/reset-password?token=abc123
Call log:
  - navigating to "http://localhost:5173/reset-password?token=abc123", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Reset Password Flow (UI)", () => {
  4  |   test("reset-password page with no token shows invalid message", async ({
  5  |     page,
  6  |   }) => {
  7  |     await page.goto("/reset-password");
  8  |     await page.waitForTimeout(500);
  9  |     const text = await page.locator("body").textContent();
  10 |     expect(text).toMatch(/invalid|expired|missing/i);
  11 |   });
  12 | 
  13 |   test("reset-password with token shows form", async ({ page }) => {
  14 |     await page.goto("/reset-password?token=abc123");
  15 |     await page.waitForTimeout(500);
  16 |     // Should show a form with password input
  17 |     const hasPasswordInput =
  18 |       (await page.locator("input[type=password]").count()) > 0;
  19 |     expect(hasPasswordInput).toBeTruthy();
  20 |   });
  21 | 
  22 |   test("reset-password shows validation", async ({ page }) => {
  23 |     await page.goto("/reset-password?token=abc123");
  24 |     await page.waitForTimeout(500);
  25 |     // Fill weak password
  26 |     const inputs = page.locator("input[type=password]");
  27 |     await inputs.first().fill("short");
  28 |     await page.getByRole("button", { name: /reset/i }).click();
  29 |     await page.waitForTimeout(500);
  30 |     // Should show an error about password length
  31 |     const text = await page.locator("body").textContent();
  32 |     expect(text).toMatch(/8|characters|password/i);
  33 |   });
  34 | 
  35 |   test("reset-password confirms password mismatch", async ({ page }) => {
> 36 |     await page.goto("/reset-password?token=abc123");
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/reset-password?token=abc123
  37 |     await page.waitForTimeout(500);
  38 |     const inputs = page.locator("input[type=password]");
  39 |     await inputs.first().fill("ValidPassword1!");
  40 |     if ((await inputs.count()) > 1) {
  41 |       await inputs.nth(1).fill("DifferentPassword1!");
  42 |       await page.getByRole("button", { name: /reset/i }).click();
  43 |       await page.waitForTimeout(500);
  44 |       const text = await page.locator("body").textContent();
  45 |       expect(text).toMatch(/match|confirm/i);
  46 |     }
  47 |   });
  48 | });
  49 | 
```