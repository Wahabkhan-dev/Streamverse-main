# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> unknown route shows 404 or redirects
- Location: e2e\navigation.spec.ts:30:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/this-route-does-not-exist-xyz
Call log:
  - navigating to "http://localhost:5173/this-route-does-not-exist-xyz", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | const customerRoutes = [
  4  |   { path: "/", name: "Homepage" },
  5  |   { path: "/movies", name: "Movies" },
  6  |   { path: "/ebooks", name: "eBooks" },
  7  |   { path: "/audiobooks", name: "Audiobooks" },
  8  |   { path: "/search", name: "Search" },
  9  |   { path: "/sign-in", name: "Sign In" },
  10 |   { path: "/signup", name: "Signup" },
  11 |   { path: "/forgot-password", name: "Forgot Password" },
  12 | ];
  13 | 
  14 | for (const route of customerRoutes) {
  15 |   test(`${route.name} page loads without error`, async ({ page }) => {
  16 |     await page.goto(route.path);
  17 |     await page.waitForTimeout(1000);
  18 |     // Should not show a crash/error page
  19 |     await expect(page.locator("body")).not.toContainText("Something went wrong");
  20 |     // Should not show a blank page
  21 |     await expect(page.locator("body")).not.toBeEmpty();
  22 |     // No JS errors (check console)
  23 |     const errors: string[] = [];
  24 |     page.on("pageerror", (err) => errors.push(err.message));
  25 |     await page.waitForTimeout(500);
  26 |     expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  27 |   });
  28 | }
  29 | 
  30 | test("unknown route shows 404 or redirects", async ({ page }) => {
> 31 |   await page.goto("/this-route-does-not-exist-xyz");
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/this-route-does-not-exist-xyz
  32 |   await page.waitForTimeout(500);
  33 |   // Should either show 404 page or redirect, not crash
  34 |   await expect(page.locator("body")).not.toContainText("Something went wrong");
  35 | });
  36 | 
  37 | test("browser back and forward work on main pages", async ({ page }) => {
  38 |   await page.goto("/");
  39 |   await page.goto("/movies");
  40 |   await page.goBack();
  41 |   await expect(page).toHaveURL("/");
  42 |   await page.goForward();
  43 |   await expect(page).toHaveURL("/movies");
  44 | });
  45 | 
```