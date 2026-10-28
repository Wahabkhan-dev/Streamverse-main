import { expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { FIXTURES } from "./env";

/** Helpers that drive the original Add Movie / eBook / Audiobook steppers in a real browser. */
export const next = async (page: Page) => {
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.waitForTimeout(500);
};

export const chooseLanguage = async (page: Page, name: string) => {
  await page.locator("#primaryLanguage").click();
  await page.locator("#primaryLanguage").fill(name);
  await page.getByRole("option", { name }).first().click();
};

/** A file slot reaches Ready only once the server has verified it (and, for video/audio, finished processing it). */
export const ready = async (page: Page, slotLabel: string, timeout = 120_000) => {
  const slot = page
    .locator(`[id^="f-"]`)
    .filter({ has: page.getByLabel(`${slotLabel} file`, { exact: true }) });
  await expect(slot.getByText("Ready", { exact: true }).first()).toBeVisible({ timeout });
};

/** Chooses a picture from the Media Library inside a wizard image slot (label as shown on the slot). */
export const pickLibraryImage = async (page: Page, slot: string, search: string) => {
  await page.getByTestId(`library-${slot}`).click();
  const picker = page.getByTestId("media-picker");
  await expect(picker).toBeVisible();
  await picker.getByLabel("Search images").fill(search);
  const item = picker.getByTestId("picker-item").first();
  await expect(item).toBeVisible();
  await item.click();
  await picker.getByTestId("picker-confirm").click();
  await expect(picker).toBeHidden();
};

/** Movie wizard: fills steps 1-4 (metadata, language, main MP4) and lands on "Images & banners". */
export async function movieToImages(page: Page, title: string) {
  await page.goto("/admin/movies/new");
  await page.locator("#title").fill(title);
  await page.locator("#shortDesc").fill("A short description.");
  await page.locator("#fullDesc").fill("A longer synopsis for the wizard test.");
  await page.locator("#releaseDate").fill("2025-02-02");
  await page.locator("#runtime").fill("1");
  await page.locator("#genre").selectOption({ index: 1 });
  await next(page);
  await chooseLanguage(page, "English");
  await next(page);
  await page.getByLabel("Main Movie File file").setInputFiles(join(FIXTURES, "movie.mp4"));
  await ready(page, "Main Movie File");
  await next(page);
  await next(page); // trailer is optional
}

/** eBook wizard: steps 1-3 (metadata, language, EPUB) and lands on "Cover & banners". */
export async function ebookToCovers(page: Page, title: string) {
  await page.goto("/admin/ebooks/new");
  await page.locator("#title").fill(title);
  await page.locator("#author").fill("Wizard Author");
  await page.locator("#summary").fill("A short summary.");
  await page.locator("#fullDesc").fill("A fuller description of the book.");
  await page.locator("#genre").selectOption({ index: 1 });
  await next(page);
  await chooseLanguage(page, "English");
  await next(page);
  await page.getByLabel("EPUB file", { exact: true }).setInputFiles(join(FIXTURES, "book.epub"));
  await ready(page, "EPUB");
  await next(page);
}

/** Audiobook wizard: steps 1-4 (metadata, narrator, audio, chapters) and lands on "Images & banners". */
export async function audiobookToImages(page: Page, title: string) {
  await page.goto("/admin/audiobooks/new");
  await page.locator("#title").fill(title);
  await page.locator("#author").fill("Wizard Author");
  await page.locator("#summary").fill("A short summary.");
  await page.locator("#fullDesc").fill("A fuller description of the audiobook.");
  await page.locator("#genre").selectOption({ index: 1 });
  await next(page);
  await chooseLanguage(page, "English");
  await page.locator("#narrator").fill("Wizard Narrator");
  await next(page);
  await page
    .getByLabel("Primary Audiobook Master File file")
    .setInputFiles(join(FIXTURES, "audiobook.mp3"));
  await ready(page, "Primary Audiobook Master File");
  await next(page);
  await next(page);
}

/** Waits until `count` picture slots show their size line and none is still sending to storage. */
export const imagesUploaded = async (page: Page, count: number) => {
  await expect(page.getByText(/\d+ × \d+ px/)).toHaveCount(count, { timeout: 60_000 });
  await expect(page.getByText("Uploading to storage")).toHaveCount(0, { timeout: 60_000 });
};
