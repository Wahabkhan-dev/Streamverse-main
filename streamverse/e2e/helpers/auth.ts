import type { Page } from "@playwright/test";

export async function loginAsDemo(page: Page) {
  // In DEMO_MODE, just navigate to home — user is pre-seeded
  await page.goto("/");
  await page.waitForTimeout(500);
}

export async function navigateAndWait(page: Page, path: string, ms = 1000) {
  await page.goto(path);
  await page.waitForTimeout(ms);
}
