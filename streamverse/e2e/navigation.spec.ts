import { test, expect } from "@playwright/test";

const customerRoutes = [
  { path: "/", name: "Homepage" },
  { path: "/movies", name: "Movies" },
  { path: "/ebooks", name: "eBooks" },
  { path: "/audiobooks", name: "Audiobooks" },
  { path: "/search", name: "Search" },
  { path: "/sign-in", name: "Sign In" },
  { path: "/signup", name: "Signup" },
  { path: "/forgot-password", name: "Forgot Password" },
];

for (const route of customerRoutes) {
  test(`${route.name} page loads without error`, async ({ page }) => {
    await page.goto(route.path);
    await page.waitForTimeout(1000);
    // Should not show a crash/error page
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    // Should not show a blank page
    await expect(page.locator("body")).not.toBeEmpty();
    // No JS errors (check console)
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(500);
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });
}

test("unknown route shows 404 or redirects", async ({ page }) => {
  await page.goto("/this-route-does-not-exist-xyz");
  await page.waitForTimeout(500);
  // Should either show 404 page or redirect, not crash
  await expect(page.locator("body")).not.toContainText("Something went wrong");
});

test("browser back and forward work on main pages", async ({ page }) => {
  await page.goto("/");
  await page.goto("/movies");
  await page.goBack();
  await expect(page).toHaveURL("/");
  await page.goForward();
  await expect(page).toHaveURL("/movies");
});
