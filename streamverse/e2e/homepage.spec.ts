import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL(/\/error/);
    await expect(page.locator("body")).not.toContainText("Something went wrong");
  });

  test("homepage has navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);
    // Header navigation exists
    await expect(page.getByRole("banner").first()).toBeVisible();
  });

  test("homepage CTAs link to signup or content", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);
    const signupLinks = page.getByRole("link", {
      name: /sign up|get started|start/i,
    });
    const count = await signupLinks.count();
    if (count > 0) {
      const href = await signupLinks.first().getAttribute("href");
      expect(href).toMatch(/signup|sign-up/i);
    }
  });
});
