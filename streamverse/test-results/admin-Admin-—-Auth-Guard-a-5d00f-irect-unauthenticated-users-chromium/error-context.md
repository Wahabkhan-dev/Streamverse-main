# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> Admin — Auth Guard >> admin routes redirect unauthenticated users
- Location: e2e\admin.spec.ts:4:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/dashboard
Call log:
  - navigating to "http://localhost:5173/admin/dashboard", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Admin — Auth Guard", () => {
  4  |   test("admin routes redirect unauthenticated users", async ({ page }) => {
> 5  |     await page.goto("/admin/dashboard");
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/admin/dashboard
  6  |     await page.waitForTimeout(1000);
  7  |     // Should redirect to sign-in or show access denied
  8  |     const url = page.url();
  9  |     const isRedirected =
  10 |       url.includes("/sign-in") || url.includes("/login");
  11 |     const isAccessDenied = await page
  12 |       .locator("body")
  13 |       .textContent()
  14 |       .then(
  15 |         (t) =>
  16 |           t?.includes("Access denied") ||
  17 |           t?.includes("sign in") ||
  18 |           t?.includes("unauthorized") ||
  19 |           false
  20 |       );
  21 |     expect(isRedirected || isAccessDenied).toBeTruthy();
  22 |   });
  23 | });
  24 | 
```