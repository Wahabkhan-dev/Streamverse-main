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

// Runs in the live-r2-no-cors project: hls.js fetches HLS segments straight from R2 with XHR, which needs bucket
// CORS (BLOCKED EXTERNAL, see cors.live.spec.ts). Everything else in the chain is real.
test("movie: the processed HLS stream plays from R2 through the app, seeks, and progress + stream slot are handled", async ({
  page,
}) => {
  const net = track(page);
  const media: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/media/hls/") || /\.(m3u8|ts)(\?|$)/.test(u))
      media.push(`${r.status()} ${u.split("?")[0]!.split("/").slice(-2).join("/")}`);
  });

  await page.goto(`/watch/${seed.movie.slug}`);
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), {
      message: "first segment decoded",
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(2);

  const info = await video.evaluate((v: HTMLVideoElement) => ({
    w: v.videoWidth,
    h: v.videoHeight,
    d: v.duration,
  }));
  expect([info.w, info.h], "the real 480p rendition").toEqual([854, 480]);
  expect(info.d).toBeGreaterThan(3.5);
  expect(info.d).toBeLessThan(5);

  const play = page.getByRole("button", { name: "Play", exact: true });
  if (await play.isVisible().catch(() => false)) await play.click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      message: "playback advances",
    })
    .toBeGreaterThan(0.5);

  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 2.5;
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThanOrEqual(2.5);

  expect(
    media.some((m) => m.startsWith("200") && m.endsWith("master.m3u8")),
    `master playlist served by the API: ${media.join(" | ")}`,
  ).toBe(true);
  expect(
    media.some((m) => m.startsWith("200") && m.endsWith(".ts")),
    "a media segment came from R2",
  ).toBe(true);

  // the clip is only 4 s, so by now the "finished" overlay covers the controls; trigger the real handler directly
  await page.getByRole("button", { name: "Close player" }).dispatchEvent("click");
  await expect
    .poll(
      () =>
        net.calls.some(
          (c) => c.method === "PUT" && c.path.startsWith("/me/progress/movie/") && c.status === 200,
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
        (await asUser().get<{ positionSeconds: number }>(`/me/progress/movie/${seed.movie.id}`)).data.positionSeconds,
      { message: "position stored in the database", timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(1);
  expect(net.bad(), "no 404/5xx during playback").toEqual([]);
});

test("movie: a title that is no longer published stops streaming immediately", async ({ page }) => {
  // the playlist endpoint re-checks publication on every request, so an unexpired token is not enough
  const user = asUser();
  const pb = (
    await user.post<{ playback: { url: string } }>(`/media/movies/${seed.movie.id}/playback`)
  ).data.playback.url;
  expect((await fetch(pb)).status, "published -> playlist is served").toBe(200);
  const { asAdmin } = await import("./lib/auth");
  const admin = asAdmin();
  await admin.post(`/admin/movies/${seed.movie.id}/unpublish`, {});
  try {
    expect(
      (await fetch(pb)).status,
      "unpublished -> the same unexpired token no longer works",
    ).toBe(404);
  } finally {
    await admin.post(`/admin/movies/${seed.movie.id}/publish`, {});
  }
  expect((await fetch(pb)).status, "republished -> serves again").toBe(200);
  await page.goto("/");
});
