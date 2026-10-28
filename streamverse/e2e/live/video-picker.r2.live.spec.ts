import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { ADMIN_STATE, FIXTURES } from "./lib/env";
import { chooseLanguage, next, ready } from "./lib/wizard";

/**
 * The "choose from Media Library" picker of a video slot talks about that slot's videos, never about images: the trailer
 * slot asks for a trailer video, the teaser slot for a teaser video, and only files of that kind are offered.
 */
test.use({ storageState: ADMIN_STATE });

test("the trailer and teaser pickers offer only their own videos and say so", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/admin/movies/new");
  await page.locator("#title").fill(`Picker words ${Date.now()}`);
  await page.locator("#shortDesc").fill("A short description.");
  await page.locator("#fullDesc").fill("A longer synopsis for the picker test.");
  await page.locator("#releaseDate").fill("2025-02-02");
  await page.locator("#runtime").fill("1");
  await page.locator("#genre").selectOption({ index: 1 });
  await next(page);
  await chooseLanguage(page, "English");
  await next(page);
  await page.getByLabel("Main Movie File file").setInputFiles(join(FIXTURES, "movie.mp4"));
  await ready(page, "Main Movie File");
  await next(page); // now on "Trailer & media"

  for (const [slot, words, role] of [
    ["trailer", /choose the official trailer video/i, "Trailer"],
    ["teaser", /choose the teaser trailer video/i, "Teaser"],
  ] as const) {
    await page.getByTestId(`library-${slot}`).click();
    const picker = page.getByTestId("media-picker");
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("heading", { name: words })).toBeVisible();
    await expect(picker.getByTestId("picker-confirm")).toHaveText("Use this video");
    await expect(picker.getByLabel("Search videos")).toBeVisible();
    // the list (or the empty message) is about this slot's videos; "image" is never mentioned
    await expect(picker.getByTestId("picker-item").first().or(picker.getByText(/in the Media Library yet/i))).toBeVisible({ timeout: 15_000 });
    expect(await picker.innerText()).not.toMatch(/\bimages?\b/i);
    for (const line of await picker.getByTestId("picker-item").allInnerTexts()) expect(line).toContain(role);
    await page.screenshot({ path: `test-results-live/video-picker-${slot}.png` });
    await picker.getByRole("button", { name: "Cancel" }).click();
    await expect(picker).toBeHidden();
  }
});
