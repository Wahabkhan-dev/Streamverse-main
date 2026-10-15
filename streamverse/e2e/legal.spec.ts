import { test, expect } from "@playwright/test";

const legalRoutes = ["/privacy-policy", "/terms", "/refund-policy"];

for (const route of legalRoutes) {
  test(`${route} loads without error`, async ({ page }) => {
    await page.goto(route);
    await page.waitForTimeout(1000);
    await expect(page).not.toHaveURL(/\/error/);
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });
}
