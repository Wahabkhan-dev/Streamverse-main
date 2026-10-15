import { test, expect } from "@playwright/test";

test.describe("Movies Catalog", () => {
  test("movies page loads", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/\/error/);
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });

  test("movies page shows loading or content (not blank)", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForTimeout(500);
    // Either a loading skeleton or actual content
    const hasContent =
      (await page
        .locator("[data-testid='movie-card'], .movie-card, [href*='/movies/']")
        .count()) > 0;
    const hasLoading =
      (await page
        .locator("[data-testid='skeleton'], .skeleton, [aria-busy='true']")
        .count()) > 0;
    const hasEmpty = await page
      .locator("body")
      .textContent()
      .then((t) => t?.includes("No movies") || t?.includes("empty") || false);
    expect(hasContent || hasLoading || hasEmpty).toBeTruthy();
  });
});

test.describe("eBooks Catalog", () => {
  test("ebooks page loads", async ({ page }) => {
    await page.goto("/ebooks");
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/\/error/);
  });
});

test.describe("Audiobooks Catalog", () => {
  test("audiobooks page loads", async ({ page }) => {
    await page.goto("/audiobooks");
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/\/error/);
  });
});

test.describe("Search", () => {
  test("search page loads", async ({ page }) => {
    await page.goto("/search");
    await page.waitForTimeout(500);
    await expect(page).not.toHaveURL(/\/error/);
  });

  test("search page accepts query", async ({ page }) => {
    await page.goto("/search?q=test");
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/\/error/);
  });
});
