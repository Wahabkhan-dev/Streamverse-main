# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: catalog.spec.ts >> Movies Catalog >> movies page loads
- Location: e2e\catalog.spec.ts:4:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/movies
Call log:
  - navigating to "http://localhost:5173/movies", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Movies Catalog", () => {
  4  |   test("movies page loads", async ({ page }) => {
> 5  |     await page.goto("/movies");
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/movies
  6  |     await page.waitForTimeout(1500);
  7  |     await expect(page).not.toHaveURL(/\/error/);
  8  |     await expect(page.locator("body")).not.toContainText("Something went wrong");
  9  |   });
  10 | 
  11 |   test("movies page shows loading or content (not blank)", async ({ page }) => {
  12 |     await page.goto("/movies");
  13 |     await page.waitForTimeout(500);
  14 |     // Either a loading skeleton or actual content
  15 |     const hasContent =
  16 |       (await page
  17 |         .locator("[data-testid='movie-card'], .movie-card, [href*='/movies/']")
  18 |         .count()) > 0;
  19 |     const hasLoading =
  20 |       (await page
  21 |         .locator("[data-testid='skeleton'], .skeleton, [aria-busy='true']")
  22 |         .count()) > 0;
  23 |     const hasEmpty = await page
  24 |       .locator("body")
  25 |       .textContent()
  26 |       .then((t) => t?.includes("No movies") || t?.includes("empty") || false);
  27 |     expect(hasContent || hasLoading || hasEmpty).toBeTruthy();
  28 |   });
  29 | });
  30 | 
  31 | test.describe("eBooks Catalog", () => {
  32 |   test("ebooks page loads", async ({ page }) => {
  33 |     await page.goto("/ebooks");
  34 |     await page.waitForTimeout(1500);
  35 |     await expect(page).not.toHaveURL(/\/error/);
  36 |   });
  37 | });
  38 | 
  39 | test.describe("Audiobooks Catalog", () => {
  40 |   test("audiobooks page loads", async ({ page }) => {
  41 |     await page.goto("/audiobooks");
  42 |     await page.waitForTimeout(1500);
  43 |     await expect(page).not.toHaveURL(/\/error/);
  44 |   });
  45 | });
  46 | 
  47 | test.describe("Search", () => {
  48 |   test("search page loads", async ({ page }) => {
  49 |     await page.goto("/search");
  50 |     await page.waitForTimeout(500);
  51 |     await expect(page).not.toHaveURL(/\/error/);
  52 |   });
  53 | 
  54 |   test("search page accepts query", async ({ page }) => {
  55 |     await page.goto("/search?q=test");
  56 |     await page.waitForTimeout(1500);
  57 |     await expect(page).not.toHaveURL(/\/error/);
  58 |   });
  59 | });
  60 | 
```