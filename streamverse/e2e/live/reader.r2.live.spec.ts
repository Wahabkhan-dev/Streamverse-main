import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { asUser } from "./lib/auth";
import { SEED_FILE, USER_STATE } from "./lib/env";
import { track } from "./lib/net";
import type { Seed } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
test.use({ storageState: USER_STATE });

// Runs in the live-r2-no-cors project: epub.js / pdf.js download the file from R2 with XHR/fetch, which needs bucket
// CORS (BLOCKED EXTERNAL, see cors.live.spec.ts). The access check, rendering, navigation and progress are real.

const resetProgress = async (id: string) => {
  // start every run from a known position; a missing row is fine
  await asUser()
    .put(`/me/progress/ebook/${id}`, { page: 1, percentage: 0 })
    .catch(() => undefined);
};

test("EPUB: the uploaded file renders, navigation works, the CFI location is saved and the reader resumes there", async ({
  page,
}) => {
  await resetProgress(seed.ebookEpub.id);
  const net = track(page);
  await page.goto(`/read/${seed.ebookEpub.slug}`);

  const body = () => page.frameLocator("iframe").first().locator("body");
  await expect(body(), "epub.js rendered the real uploaded content").toContainText(
    "E2E fixture paragraph",
    { timeout: 30_000 },
  );

  // epub.js paginates with CSS columns inside one iframe, so the text does not change; progress does.
  const pct = async () =>
    Number(
      (
        (await page
          .getByText(/\d+% read/)
          .first()
          .textContent()) ?? ""
      ).match(/(\d+)% read/)?.[1] ?? 0,
    );
  const next = page.getByRole("button", { name: "Next page" });
  for (let i = 0; i < 4; i++) await next.click();
  await expect.poll(pct, { message: "reading progress advanced after paging" }).toBeGreaterThan(0);
  const pctBefore = await pct();

  await page.getByRole("button", { name: "Close reader" }).click();
  await expect
    .poll(
      () =>
        net.calls.some(
          (c) => c.method === "PUT" && c.path.startsWith("/me/progress/ebook/") && c.status === 200,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);

  const saved = (
    await asUser().get<{ location: string | null; percentage: number }>(
      `/me/progress/ebook/${seed.ebookEpub.id}`,
    )
  ).data;
  expect(saved.location, "an EPUB CFI is stored in MySQL").toBeTruthy();
  expect(saved.percentage).toBeGreaterThan(0);

  await page.goto(`/read/${seed.ebookEpub.slug}`);
  await expect(body()).toContainText("E2E fixture paragraph", { timeout: 30_000 });
  await expect
    .poll(pct, { message: "resumed at the saved position, not the start" })
    .toBeGreaterThanOrEqual(Math.max(1, pctBefore - 1));
  expect(net.bad()).toEqual([]);
});

test("PDF: the uploaded file renders, page navigation works, the page is saved and the reader resumes on it", async ({
  page,
}) => {
  await resetProgress(seed.ebookPdf.id);
  const net = track(page);
  await page.goto(`/read/${seed.ebookPdf.slug}`);

  await expect(page.locator("canvas").first(), "pdf.js rendered a page").toBeVisible({
    timeout: 30_000,
  });
  const pageInput = page.getByLabel("Go to page").first();
  await expect(pageInput).toHaveValue("1");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(pageInput).toHaveValue("2");

  await page.getByRole("button", { name: "Close reader" }).click();
  await expect
    .poll(
      () =>
        net.calls.some(
          (c) => c.method === "PUT" && c.path.startsWith("/me/progress/ebook/") && c.status === 200,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);

  const saved = (
    await asUser().get<{ page: number | null }>(`/me/progress/ebook/${seed.ebookPdf.id}`)
  ).data;
  expect(saved.page, "page number stored in MySQL").toBe(2);

  await page.goto(`/read/${seed.ebookPdf.slug}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Go to page").first(), "resumed on the saved page").toHaveValue("2");
  expect(net.bad()).toEqual([]);
});
