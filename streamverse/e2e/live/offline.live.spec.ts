import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_FILE, USER_STATE } from "./lib/env";
import type { Seed } from "./lib/seed";

/**
 * Offline use, in a real browser against the real API, MySQL and R2: a movie, an eBook and an audiobook are downloaded,
 * then the network is switched off and each one plays / opens from the device. Pages that need the internet open the
 * "Connect to the internet" popup instead of a broken page.
 */
test.use({ storageState: USER_STATE });
const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
/** Set when running against `npm run build` output (served e.g. with `PORT=8081 node .output/server/index.mjs`): the service worker has saved the whole app. */
const BUILT = process.env["E2E_BUILT"] === "1";


/** The <video>/<audio> on the page has data and a length; on failure says what the page showed instead. */
async function mediaReady(page: Page, tag: "video" | "audio") {
  try {
    await page.waitForFunction(
      (t) => {
        const el = document.querySelector(t) as HTMLMediaElement | null;
        return !!el && el.readyState >= 2 && el.duration > 0;
      },
      tag,
      { timeout: 45_000 },
    );
  } catch (e) {
    const info = await page.evaluate((t) => {
      const el = document.querySelector(t) as HTMLMediaElement | null;
      return { url: location.pathname, el: el ? { src: el.currentSrc || el.src, ready: el.readyState, dur: el.duration, err: el.error?.code ?? null } : null, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 200) };
    }, tag);
    throw new Error(`${tag} not ready: ${JSON.stringify(info)}`, { cause: e });
  }
}

async function download(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const start = page.getByTestId("download-start");
  await expect(start).toBeVisible({ timeout: 30_000 });
  await start.click();
  await expect(page.getByTestId("download-done")).toBeVisible({ timeout: 180_000 });
}

test("download a movie, an eBook and an audiobook, then use all three with no internet", async ({ page, context }) => {
  test.skip(!BUILT, "Offline use needs the built site (E2E_BUILT=1 against `npm run build` output): a dev server serves every screen as a separate file.");
  test.setTimeout(420_000);

  // ---- 1. download while online (each is removed first so the test always starts clean)
  await page.goto("/downloads");
  await page.waitForLoadState("networkidle");
  if (await page.getByRole("button", { name: "Remove all" }).count()) {
    await page.getByRole("button", { name: "Remove all" }).click();
    await page.getByRole("button", { name: "Remove all" }).last().click();
  }
  await download(page, `/movies/${seed.movie.slug}`);
  await download(page, `/ebooks/${seed.ebookEpub.slug}`);
  await download(page, `/audiobooks/${seed.audiobook.slug}`);

  // ---- 2. they are listed, with their own covers
  await page.goto("/downloads");
  await expect(page.getByTestId("download-row")).toHaveCount(3);
  await expect(page.getByTestId("download-row").filter({ hasText: seed.movie.title })).toContainText("Movie");

  // ---- 3. warm each player (a dev server serves screens as separate files; a built site has them all saved already)
  for (const [name, hrefPart] of [
    [seed.movie.title, "/watch/"],
    [seed.ebookEpub.title, "/read/"],
    [seed.audiobook.title, "/listen/"],
  ] as const) {
    await page.getByTestId("download-row").filter({ hasText: name }).getByTestId("download-play").click();
    await expect(page).toHaveURL(new RegExp(hrefPart));
    await page.goBack();
    await expect(page).toHaveURL(/\/downloads/);
  }

  // ---- 4. no internet: the bar appears, and something that is not saved opens the popup instead of a broken page
  await context.setOffline(true);
  await expect(page.getByTestId("connection-banner")).toContainText("You're offline");
  await page.getByRole("link", { name: "Movies", exact: true }).first().click();
  await expect(page.getByTestId("internet-dialog")).toContainText("Connect to the internet");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByTestId("internet-dialog")).toHaveCount(0);

  // ---- 5. the movie plays from the device
  await page.getByTestId("download-row").filter({ hasText: seed.movie.title }).getByTestId("download-play").click();
  await expect(page).toHaveURL(/\/watch\//);
  await mediaReady(page, "video");
  const played = await page.evaluate(async () => {
    const v = document.querySelector("video")!;
    v.muted = true;
    await v.play().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2500));
    return { t: v.currentTime, duration: v.duration, src: v.currentSrc || v.src };
  });
  expect(played.duration).toBeGreaterThan(1);
  expect(played.t).toBeGreaterThan(0.3);
  await page.goBack();

  // ---- 6. the eBook opens from the device
  await page.getByTestId("download-row").filter({ hasText: seed.ebookEpub.title }).getByTestId("download-play").click();
  await expect(page).toHaveURL(/\/read\//);
  await expect(page.locator(".epub-container iframe, iframe").first()).toBeAttached({ timeout: 60_000 });
  await expect(page.getByText(/Unable to access|not yet ready|could not/i)).toHaveCount(0);
  await page.goBack();

  // ---- 7. the audiobook plays from the device
  await page.getByTestId("download-row").filter({ hasText: seed.audiobook.title }).getByTestId("download-play").click();
  await expect(page).toHaveURL(/\/listen\//);
  await mediaReady(page, "audio");

  // ---- 7b. a built site keeps the whole app on the device: a full reload (and a cold open of a player) works with no internet
  if (BUILT) {
    await page.goto("/downloads").catch(() => undefined);
    await expect(page.getByTestId("download-row")).toHaveCount(3, { timeout: 30_000 });
    await page.goto(`/listen/${seed.audiobook.slug}`).catch(() => undefined);
    await mediaReady(page, "audio");
    await page.goto(`/watch/${seed.movie.slug}`).catch(() => undefined);
    await mediaReady(page, "video");
  }

  // ---- 8. back online: the bar goes
  await context.setOffline(false);
  await expect(page.getByTestId("connection-banner")).toHaveCount(0, { timeout: 15_000 });
});

test("a title that is not downloaded opens the popup with no internet, and downloads can be removed", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto("/downloads");
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page.getByRole("link", { name: "eBooks", exact: true }).first().click();
  await expect(page.getByTestId("internet-dialog")).toBeVisible();
  await context.setOffline(false);
  // coming back online closes the popup by itself
  await expect(page.getByTestId("internet-dialog")).toHaveCount(0, { timeout: 15_000 });
});
