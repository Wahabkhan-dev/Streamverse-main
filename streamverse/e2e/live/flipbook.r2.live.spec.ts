import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { asAdmin } from "./lib/auth";
import { SEED_FILE, USER_STATE } from "./lib/env";
import type { Seed } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
test.use({ storageState: USER_STATE });

// Runs in the live-r2-no-cors project: pdf.js downloads the PDF from R2 in the browser (see reader.r2.live.spec.ts).

test("flipbook: the option shows a Flipbook button on the book page and opens a page-turning reader", async ({ page }) => {
  await asAdmin().put(`/admin/ebooks/${seed.ebookPdf.id}`, { ebook: { flipbookEnabled: true } });
  try {
    await page.goto(`/ebooks/${seed.ebookPdf.slug}`);
    const button = page.getByTestId("flipbook-button");
    await expect(button, "the product page offers the flipbook").toBeVisible({ timeout: 30_000 });
    await button.click();

    await expect(page.getByTestId("flipbook")).toBeVisible({ timeout: 30_000 });
    const label = page.getByTestId("flipbook-page");
    await expect(label).toContainText("Page 1 /", { timeout: 30_000 });
    await expect(page.locator(".sv-flip-page img").first(), "a real PDF page was drawn").toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(label).toContainText(/Page [23] \//);
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(label).toContainText("Page 1 /");

    await page.getByRole("button", { name: "Close flipbook" }).click();
    await expect(page).toHaveURL(new RegExp(`/ebooks/${seed.ebookPdf.slug}$`));
  } finally {
    await asAdmin().put(`/admin/ebooks/${seed.ebookPdf.id}`, { ebook: { flipbookEnabled: false } });
  }
});

test("flipbook: a book without the option has no Flipbook button", async ({ page }) => {
  await page.goto(`/ebooks/${seed.ebookPdf.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("flipbook-button")).toHaveCount(0);
});
