# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: homepage.spec.ts >> Homepage >> homepage has navigation
- Location: e2e\homepage.spec.ts:11:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Homepage", () => {
  4  |   test("homepage loads", async ({ page }) => {
  5  |     await page.goto("/");
  6  |     await page.waitForTimeout(2000);
  7  |     await expect(page).not.toHaveURL(/\/error/);
  8  |     await expect(page.locator("body")).not.toContainText("Something went wrong");
  9  |   });
  10 | 
  11 |   test("homepage has navigation", async ({ page }) => {
> 12 |     await page.goto("/");
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
  13 |     await page.waitForTimeout(1000);
  14 |     // Header navigation exists
  15 |     await expect(page.getByRole("banner").first()).toBeVisible();
  16 |   });
  17 | 
  18 |   test("homepage CTAs link to signup or content", async ({ page }) => {
  19 |     await page.goto("/");
  20 |     await page.waitForTimeout(1000);
  21 |     const signupLinks = page.getByRole("link", {
  22 |       name: /sign up|get started|start/i,
  23 |     });
  24 |     const count = await signupLinks.count();
  25 |     if (count > 0) {
  26 |       const href = await signupLinks.first().getAttribute("href");
  27 |       expect(href).toMatch(/signup|sign-up/i);
  28 |     }
  29 |   });
  30 | });
  31 | 
```