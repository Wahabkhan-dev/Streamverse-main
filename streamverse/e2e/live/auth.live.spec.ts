import { expect, test, type Page } from "@playwright/test";
import { asUser } from "./lib/auth";
import { ADMIN_STATE, API, TOKEN_KEY, USER, USER_STATE, WEB } from "./lib/env";
import { track } from "./lib/net";

async function uiLogin(page: Page) {
  await page.goto(`${WEB}/sign-in`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(USER.email);
  await page.getByLabel("Password", { exact: true }).fill(USER.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction((k) => !!localStorage.getItem(k), TOKEN_KEY, { timeout: 20_000 });
}

test.describe("session handling", () => {
  test("an EXPIRED access token with a valid refresh cookie recovers silently (one refresh, no redirect)", async ({
    browser,
  }) => {
    // its own login: refresh tokens rotate, so the shared saved session must never be spent here
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await uiLogin(page);
    await page.evaluate((k) => localStorage.setItem(k, "expired.or.garbage"), TOKEN_KEY);
    const net = track(page);
    await page.goto("/my-list");
    await expect(page).toHaveURL(/\/my-list/);
    await expect
      .poll(() => net.calls.some((c) => c.path === "/auth/refresh" && c.status === 200))
      .toBe(true);
    expect(net.count("/auth/refresh"), "exactly one refresh, not a storm").toBe(1);
    expect(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY)).not.toBe(
      "expired.or.garbage",
    );
    await ctx.close();
  });

  test("a dead session (no valid refresh) sends the user to sign-in once, with no loop", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // set the dead token ONCE (an init script would re-insert it on every page load, including after the app clears it)
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    await page.evaluate((k) => localStorage.setItem(k, "dead.token"), TOKEN_KEY);
    const net = track(page);
    let navigations = 0;
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations++;
    });
    await page.goto("/my-list");
    await expect(page).toHaveURL(/\/sign-in/);
    await page.waitForTimeout(3000);
    expect(net.count("/auth/refresh"), "refresh attempted once, then given up").toBeLessThanOrEqual(
      1,
    );
    expect(navigations, "no reload loop on the sign-in page").toBeLessThanOrEqual(4);
    await ctx.close();
  });

  test("wrong password shows a friendly message and does not refresh or redirect", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const net = track(page);
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email address").fill(USER.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/invalid|incorrect|wrong|credentials/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
    expect(net.count("/auth/refresh")).toBe(0);
    expect(await page.locator("body").textContent()).not.toMatch(
      /prisma|stack trace|sql|at \w+\.\w+ \(/i,
    );
    await ctx.close();
  });
});

test.describe("authorization", () => {
  test.use({ storageState: USER_STATE });

  test("a normal user opening an admin page is denied but NOT logged out", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(
      page.getByRole("heading", { name: "Admin access required" }),
      "access-denied screen, not the dashboard",
    ).toBeVisible();
    await expect(page.getByText(/Welcome back/)).toHaveCount(0);
    expect(
      await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY),
      "still signed in",
    ).toBeTruthy();
  });

  test("direct API calls cannot bypass the UI: a user token is refused on every admin endpoint", async () => {
    const user = asUser();
    for (const path of [
      "/admin/movies",
      "/admin/users",
      "/admin/dashboard",
      "/admin/homepage/sections",
      "/admin/settings",
    ]) {
      const res = await user.raw("GET", path);
      expect(res.status, `GET ${path} as a normal user`).toBe(403);
    }
    const anon = await fetch(`${API}/admin/movies`);
    expect(anon.status, "no token at all").toBe(401);
  });
});

test.describe("admin session", () => {
  test.use({ storageState: ADMIN_STATE });
  test("the admin is recognised after a full reload (session persisted)", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });
});
