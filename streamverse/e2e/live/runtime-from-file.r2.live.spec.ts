import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { ADMIN_STATE, FIXTURES } from "./lib/env";
import { chooseLanguage, next, ready } from "./lib/wizard";

/** The admin does not type the runtime: it is read from the movie file they upload. */
test.use({ storageState: ADMIN_STATE });

test("the runtime is filled in from the movie file", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/admin/movies/new");
  await page.locator("#title").fill(`Runtime from file ${Date.now()}`);
  await page.locator("#shortDesc").fill("A short description.");
  await page.locator("#fullDesc").fill("A longer synopsis for the runtime test.");
  await page.locator("#releaseDate").fill("2025-02-02");
  await page.locator("#genre").selectOption({ index: 1 });
  await expect(page.locator("#runtime")).toHaveValue("");
  await next(page); // the empty runtime does not block the first step
  await chooseLanguage(page, "English");
  await next(page);
  await page.getByLabel("Main Movie File file").setInputFiles(join(FIXTURES, "movie.mp4")); // a 4-second clip
  await ready(page, "Main Movie File");
  await page.getByRole("button", { name: /basic/i }).first().click();
  await expect(page.locator("#runtime")).toHaveValue("1");
  await expect(page.getByText("Shown to customers as")).toBeVisible();
});
