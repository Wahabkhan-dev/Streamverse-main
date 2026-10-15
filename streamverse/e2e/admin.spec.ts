import { test, expect } from "@playwright/test";

test.describe("Admin — Auth Guard", () => {
  test("admin routes redirect unauthenticated users", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForTimeout(1000);
    // Should redirect to sign-in or show access denied
    const url = page.url();
    const isRedirected =
      url.includes("/sign-in") || url.includes("/login");
    const isAccessDenied = await page
      .locator("body")
      .textContent()
      .then(
        (t) =>
          t?.includes("Access denied") ||
          t?.includes("sign in") ||
          t?.includes("unauthorized") ||
          false
      );
    expect(isRedirected || isAccessDenied).toBeTruthy();
  });
});
