import { expect, test } from "@playwright/test";
import { USER_STATE } from "./lib/env";

test.use({ storageState: USER_STATE });
// leaving the page ends the stream like a real viewer does (a closed test browser never tells the server)
test.afterEach(async ({ page }) => {
  await page.goto("about:blank").catch(() => undefined);
  await page.waitForTimeout(500);
});

// a published title whose stream has 480p, 720p and 1080p
const SLUG = process.env["E2E_MULTI_QUALITY_SLUG"] ?? "ember-protocol";

test("the Quality setting lists the stream's real qualities and switches the picture", async ({ page }) => {
  test.setTimeout(180_000);
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
  await expect(list.getByRole("radio")).toHaveText(["Auto", "1080p", "720p", "480p"]);

  for (const [label, h] of [["720p", 720], ["1080p", 1080], ["480p", 480]] as const) {
    await list.getByRole("radio", { name: label }).click();
    await expect(page.getByTestId("quality-badge")).toHaveText(label);
    // the picture really changes: playing moves the new quality's pieces into view
    await video.evaluate((v: HTMLVideoElement) => v.play().catch(() => undefined));
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
