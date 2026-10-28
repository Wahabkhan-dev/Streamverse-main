import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_FILE, USER_STATE } from "./lib/env";
import type { Seed } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
test.use({ storageState: USER_STATE });
// leaving the page ends the stream like a real viewer does (a closed test browser never tells the server)
test.afterEach(async ({ page }) => {
  await page.goto("about:blank").catch(() => undefined);
  await page.waitForTimeout(500);
});

/** The movie player's keyboard: 5-second arrows, volume with an on-screen percentage, full screen, mini player, help. */
test("movie player keyboard shortcuts", async ({ page }) => {
  test.setTimeout(180_000);
  const t0 = Date.now();
  await page.goto(`/watch/${seed.movie.slug}`);
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  console.log(`[player] first picture ready after ${Date.now() - t0} ms`);

  const flash = page.getByTestId("player-flash");
  const time = () => video.evaluate((v: HTMLVideoElement) => v.currentTime);

  // hold the clip still so the seeks are easy to check
  // (a headless browser may refuse to start playing on its own, so "k" may start it rather than stop it)
  await page.keyboard.press("k");
  await expect(flash).toContainText(/Paused|Play/);
  if (!(await video.evaluate((v: HTMLVideoElement) => v.paused))) {
    await page.keyboard.press("k");
    await expect(flash).toContainText("Paused");
  }
  await video.evaluate((v: HTMLVideoElement) => (v.currentTime = 0.5));

  // volume starts at 80%
  await page.keyboard.press("ArrowUp");
  await expect(flash).toContainText("90%");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(flash).toContainText("70%");
  expect(await video.evaluate((v: HTMLVideoElement) => v.volume)).toBeCloseTo(0.7);
  await page.screenshot({ path: "test-results-live/player-volume.png" });
  await page.keyboard.press("m");
  await expect(flash).toContainText("Muted");
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await page.keyboard.press("m");

  // the clip is 4 s long: forward 5 s reaches the end, back 5 s returns to the start
  await page.keyboard.press("ArrowRight");
  await expect(flash).toContainText("5 sec");
  await expect.poll(time).toBeGreaterThan(3.5);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(time).toBeLessThan(0.5);

  // speed
  await page.keyboard.press("Shift+Period");
  await expect(flash).toContainText("1.25x");
  expect(await video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.25);

  // the list of shortcuts
  await page.keyboard.press("Shift+Slash");
  await expect(page.getByTestId("player-shortcuts")).toBeVisible();
  await expect(page.getByTestId("player-shortcuts")).toContainText("Mini player");
  await page.screenshot({ path: "test-results-live/player-shortcuts.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("player-shortcuts")).toBeHidden();

  // full screen on and off
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);

  // "i": the movie's own page opens and the video keeps playing in the corner, like YouTube
  await video.evaluate((v: HTMLVideoElement) => (v.currentTime = 1));
  await page.keyboard.press("i");
  await expect(page).toHaveURL(new RegExp(`/movies/${seed.movie.slug}$`));
  const mini = page.getByTestId("mini-player");
  await expect(mini).toBeVisible();
  const miniVideo = mini.locator("video");
  await expect
    .poll(() => miniVideo.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  await miniVideo.evaluate((v: HTMLVideoElement) => v.play().catch(() => undefined));
  await expect.poll(() => miniVideo.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(1);
  await page.screenshot({ path: "test-results-live/player-mini.png" });

  // the floating window over other apps, where this browser offers it
  if (await page.evaluate(() => !!document.pictureInPictureEnabled)) {
    await mini.hover();
    await mini.getByRole("button", { name: "Play over other apps" }).click();
    await expect.poll(() => page.evaluate(() => !!document.pictureInPictureElement)).toBe(true);
    await page.evaluate(() => document.exitPictureInPicture());
  } else console.log("[player] this browser has no floating window");

  // it keeps playing while the viewer moves around the site
  await page.getByRole("navigation").getByRole("link", { name: "Movies", exact: true }).first().click();
  await expect(page).toHaveURL(/\/movies$/);
  // same video element, still loaded (the 4 s test clip may simply have reached its end by now)
  await expect(mini).toBeVisible();
  expect(await miniVideo.evaluate((v: HTMLVideoElement) => v.readyState >= 2 && !v.error)).toBe(true);
  await mini.hover();
  await mini.getByRole("button", { name: "Open full player (i)" }).click();
  await expect(page).toHaveURL(new RegExp(`/watch/${seed.movie.slug}`));
  await expect(mini).toBeHidden();
  // the stream slot went from the full player to the mini player and back, so the full player opens again
  await expect(page.locator("video")).toBeVisible({ timeout: 30_000 });
  // close the player so its stream slot is given back (a closed test browser never says so)
  await page.getByRole("button", { name: "Close player" }).dispatchEvent("click");
  await expect(page).toHaveURL(new RegExp(`/movies/${seed.movie.slug}$`));
});
