import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN_STATE, SEED_FILE, USER_STATE } from "./lib/env";
import { r2Key, track } from "./lib/net";
import type { Seed, SeededItem } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));

type Kind = "movies" | "ebooks" | "audiobooks";
const items: Array<{ label: string; kind: Kind; item: SeededItem }> = [
  { label: "Movie", kind: "movies", item: seed.movie },
  { label: "eBook (EPUB)", kind: "ebooks", item: seed.ebookEpub },
  { label: "eBook (PDF)", kind: "ebooks", item: seed.ebookPdf },
  { label: "Audiobook", kind: "audiobooks", item: seed.audiobook },
];

/** Waits until the image has really loaded from the network (not a broken-image box) and returns its R2 object key. */
async function loadedKey(img: Locator): Promise<string> {
  await expect(img, "image element should be present").toBeVisible();
  await expect
    .poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), {
      message: "image should finish loading with real pixels",
    })
    .toBe(true);
  return r2Key(await img.getAttribute("src"));
}

const adminRowImage = (page: Page, title: string) =>
  page.locator("tr", { hasText: title }).locator("img").first();
const customerCardImage = (page: Page, kind: Kind, slug: string) =>
  page.locator(`a[href$="/${kind}/${slug}"] img`).first();

test.describe("canonical image: admin surfaces", () => {
  test.use({ storageState: ADMIN_STATE });

  for (const { label, kind, item } of items) {
    test(`${label}: Admin list shows the real uploaded image`, async ({ page }) => {
      const net = track(page);
      await page.goto(`/admin/${kind}`);
      const key = await loadedKey(adminRowImage(page, item.title));
      expect(key, "admin list image must be a real R2 object for this content").toContain(
        `/content/${item.id}/`,
      );
      expect(net.bad(), "no 404/5xx API calls while loading the list").toEqual([]);
    });
  }
});

test.describe("canonical image: same asset on every surface", () => {
  for (const { label, kind, item } of items) {
    test(`${label}: admin list, dashboard, catalog, homepage and detail all use ONE asset`, async ({
      browser,
    }) => {
      const keys: Record<string, string> = {};

      const admin = await browser.newContext({ storageState: ADMIN_STATE });
      const ap = await admin.newPage();
      await ap.goto(`/admin/${kind}`);
      keys["admin list"] = await loadedKey(adminRowImage(ap, item.title));
      // The dashboard's "Recent content" panel lists the newest few movies/eBooks; audiobooks are not on it.
      if (kind !== "audiobooks") {
        await ap.goto("/admin/dashboard");
        keys["admin dashboard"] = await loadedKey(adminRowImage(ap, item.title));
      }
      await admin.close();

      const user = await browser.newContext({ storageState: USER_STATE });
      const up = await user.newPage();
      await up.goto(`/${kind}`);
      keys["customer catalog"] = await loadedKey(customerCardImage(up, kind, item.slug));

      await up.goto(`/${kind}/${item.slug}`);
      const detail = up.locator(`img[src*="/content/${item.id}/"]`).first();
      keys["customer detail"] = await loadedKey(detail);

      if (kind === "movies") {
        await up.goto("/");
        keys["homepage"] = await loadedKey(customerCardImage(up, kind, item.slug));
      }
      await user.close();

      const distinct = new Set(Object.values(keys));
      expect(
        distinct.size,
        `every surface must render the same asset, got: ${JSON.stringify(keys, null, 1)}`,
      ).toBe(1);
      expect([...distinct][0]).toContain(`/content/${item.id}/`);
    });
  }
});

test.describe("image fallback", () => {
  test.use({ storageState: USER_STATE });

  test("a title whose image URL fails shows a placeholder block, with no layout collapse and no React warning", async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on("console", (m) => {
      if (/empty string|Warning:|validateDOMNesting/i.test(m.text())) warnings.push(m.text());
    });
    // Break every R2 image so the fallback path is exercised for real
    await page.route("**/*.r2.cloudflarestorage.com/**", (route) => route.abort());
    await page.goto("/movies");
    const card = page.locator(`a[href$="/movies/${seed.movie.slug}"]`).first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(
      box && box.width > 40 && box.height > 40,
      "card keeps its size when the image fails",
    ).toBe(true);
    expect(warnings, "no React warnings (e.g. empty src)").toEqual([]);
  });
});
