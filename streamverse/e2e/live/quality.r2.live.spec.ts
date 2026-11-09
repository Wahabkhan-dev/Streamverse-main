import { expect, test } from "@playwright/test";
import { USER_STATE } from "./lib/env";
import { db, closeDb } from "./lib/db";

test.use({ storageState: USER_STATE });
// leaving the page ends the stream like a real viewer does (a closed test browser never tells the server)
test.afterEach(async ({ page }) => {
  await page.goto("about:blank").catch(() => undefined);
  await page.waitForTimeout(500);
});

// a published movie whose processed stream has at least two qualities — read from MySQL (what the processor really produced),
// so the test follows the catalog instead of depending on one title that may be deleted
async function multiQualityMovie(): Promise<{ slug: string; renditions: string[] }> {
  const forced = process.env["E2E_MULTI_QUALITY_SLUG"];
  const movies = await db().movie.findMany({ where: { content: { deletedAt: null, status: "PUBLISHED", visibility: "PUBLIC" } }, include: { content: { select: { slug: true } }, masterAsset: { select: { status: true, metadata: true } } } });
  const found = movies
    .map((m: any) => ({ slug: m.content.slug as string, renditions: ((m.masterAsset?.status === "READY" && m.masterAsset.metadata?.renditions) || []) as string[] }))
    .filter((m: { slug: string; renditions: string[] }) => (forced ? m.slug === forced : m.renditions.length >= 2))[0];
  if (!found) throw new Error("no published movie with two or more stream qualities to test");
  return { slug: found.slug, renditions: [...found.renditions].sort((a, b) => parseInt(b) - parseInt(a)) };
}
test.afterAll(closeDb);

test("the Quality setting lists the stream's real qualities and switches the picture", async ({ page }) => {
  test.setTimeout(180_000);
  const { slug: SLUG, renditions } = await multiQualityMovie();
  await page.goto(`/watch/${SLUG}`);
  const video = page.locator("video");
  await expect(video).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const height = () => video.evaluate((v: HTMLVideoElement) => v.videoHeight);

  const open = async () => {
    await page.mouse.move(400, 300);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: /^Quality/ }).click();
  };
  await open();
  const list = page.getByRole("radiogroup", { name: "Quality" });
  await expect(list.getByRole("radio")).toHaveText(["Auto", ...renditions]);

  for (const label of [...renditions].reverse()) {
    const h = parseInt(label);
    await list.getByRole("radio", { name: label }).click();
    await expect(page.getByTestId("quality-badge")).toHaveText(label);
    // the picture really changes: playing moves the new quality's pieces into view
    // the remaining test titles are short single-segment streams: start again from 0 so the chosen quality is really loaded
    // (on a long stream the next piece would come in that quality anyway)
    await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 0; return v.play().catch(() => undefined); });
    await expect.poll(height, { timeout: 45_000, message: `${label} picture` }).toBe(h);
    console.log(`[quality] ${label} -> picture is ${await video.evaluate((v: HTMLVideoElement) => `${v.videoWidth}x${v.videoHeight}`)}`);
    // after a choice the menu is back on its first page, still open
    await page.mouse.move(420, 320);
    if (!(await page.getByRole("button", { name: /^Quality/ }).isVisible())) await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: /^Quality/ }).click();
  }
  await list.getByRole("radio", { name: "Auto" }).click();
  await expect(page.getByTestId("quality-badge")).toContainText("AUTO");

  await page.getByRole("button", { name: "Close player" }).dispatchEvent("click");
});
