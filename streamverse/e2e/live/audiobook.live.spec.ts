import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { asUser } from "./lib/auth";
import { SEED_FILE, USER_STATE } from "./lib/env";
import { track } from "./lib/net";
import type { Seed } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
test.use({ storageState: USER_STATE });
// leaving the page ends the stream like a real viewer does (a closed test browser never tells the server)
test.afterEach(async ({ page }) => {
  await page.goto("about:blank").catch(() => undefined);
  await page.waitForTimeout(500);
});

// A media element may load cross-origin without CORS, so this runs in the NORMAL (CORS-enforced) browser.
test("audiobook: the uploaded MP3 streams from R2, plays, seeks, and progress is saved to MySQL", async ({
  page,
}) => {
  const net = track(page);
  const ranges: number[] = [];
  page.on("response", (r) => {
    if (r.url().includes("cloudflarestorage") && /\.mp3/.test(r.url())) ranges.push(r.status());
  });

  await page.goto(`/listen/${seed.audiobook.slug}`);
  const audio = page.locator("audio");
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.readyState), {
      message: "audio data loaded from R2",
      timeout: 30_000, // a fresh browser loads every screen file from the dev server first
    })
    .toBeGreaterThanOrEqual(2);
  const duration = await audio.evaluate((a: HTMLAudioElement) => a.duration);
  expect(duration, "the real 6 second fixture, not placeholder data").toBeGreaterThan(5);
  expect(duration).toBeLessThan(7);

  // a real user click (autoplay without a gesture is blocked by the browser)
  const play = page.getByRole("button", { name: "Play", exact: true });
  if (await play.isVisible().catch(() => false)) await play.click();
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime), {
      message: "playback actually advances",
    })
    .toBeGreaterThan(0.5);

  // seek
  await audio.evaluate((a: HTMLAudioElement) => {
    a.currentTime = 4;
  });
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThanOrEqual(4);

  expect(
    ranges.some((s) => s === 206 || s === 200),
    "R2 served the file (206 when the browser asks for a range)",
  ).toBe(true);

  // leaving the player saves progress and releases the stream slot
  await page.getByRole("button", { name: "Back to details" }).click();
  await expect
    .poll(
      () =>
        net.calls.some(
          (c) =>
            c.method === "PUT" && c.path.startsWith("/me/progress/audiobook/") && c.status === 200,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        net.calls.some(
          (c) =>
            c.method === "POST" &&
            /\/me\/playback-sessions\/.+\/end$/.test(c.path) &&
            c.status === 200,
        ),
      { message: "stream slot released" },
    )
    .toBe(true);

  // the save sent on close can land a moment after the checks above (they are also met by earlier calls)
  await expect
    .poll(
      async () =>
        (await asUser().get<{ positionSeconds: number }>(`/me/progress/audiobook/${seed.audiobook.id}`)).data
          .positionSeconds,
      { message: "position stored in the database", timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(1);
  expect(net.bad(), "no 404/5xx during playback").toEqual([]);
});

test("audiobook: reopening resumes from the SERVER-saved position (fresh browser, no localStorage)", async ({
  page,
}) => {
  await asUser().put(`/me/progress/audiobook/${seed.audiobook.id}`, {
    positionSeconds: 4,
    durationSeconds: 6,
  });
  await page.goto(`/listen/${seed.audiobook.slug}`);
  const audio = page.locator("audio");
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.readyState), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime), {
      message: "resumed near the saved 4s mark",
    })
    .toBeGreaterThanOrEqual(3.5);
});

test("audiobook: shows the real file as one chapter, with no invented chapters or fake durations", async ({
  page,
}) => {
  await page.goto(`/listen/${seed.audiobook.slug}`);
  await expect(page.locator("audio")).toBeAttached();
  const text = (await page.locator("body").textContent()) ?? "";
  for (const fake of ["Arrival", "The Signal", "Low Tide", "40:19"])
    expect(text, `invented demo chapter "${fake}" must not appear`).not.toContain(fake);
});
