# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: legal.spec.ts >> /privacy-policy loads without error
- Location: e2e\legal.spec.ts:6:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/privacy-policy
Call log:
  - navigating to "http://localhost:5173/privacy-policy", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | const legalRoutes = ["/privacy-policy", "/terms", "/refund-policy"];
  4  | 
  5  | for (const route of legalRoutes) {
  6  |   test(`${route} loads without error`, async ({ page }) => {
> 7  |     await page.goto(route);
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/privacy-policy
  8  |     await page.waitForTimeout(1000);
  9  |     await expect(page).not.toHaveURL(/\/error/);
  10 |     await expect(page.locator("body")).not.toContainText("Something went wrong");
  11 |   });
  12 | }
  13 | 
```