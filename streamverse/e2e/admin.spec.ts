import { test, expect } from "@playwright/test";

test.describe("Admin — Auth Guard", () => {
  test("admin routes redirect unauthenticated users", async ({ page }) => {
    await page.goto("/admin/dashboard");
    // Wait for either a redirect or the access-denied state to fully render
    await page.waitForFunction(
      () => {
        const url = window.location.href;
        const text = document.body.textContent ?? "";
        return (
          url.includes("/sign-in") ||
          url.includes("/login") ||
          text.toLowerCase().includes("admin access") ||
          text.toLowerCase().includes("access denied") ||
          text.toLowerCase().includes("sign in") ||
          text.toLowerCase().includes("unauthorized")
        );
      },
      { timeout: 8000 }
    );
    const url = page.url();
    const isRedirected = url.includes("/sign-in") || url.includes("/login");
    const text = (await page.locator("body").textContent()) ?? "";
    const isAccessDenied =
      text.toLowerCase().includes("admin access") ||
      text.toLowerCase().includes("access denied") ||
      text.toLowerCase().includes("sign in") ||
      text.toLowerCase().includes("unauthorized");
    expect(isRedirected || isAccessDenied).toBeTruthy();
  });
});
