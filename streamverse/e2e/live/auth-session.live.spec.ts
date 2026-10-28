import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN_STATE, SEED_FILE, TOKEN_KEY, USER, USER_B, USER_STATE, WEB } from "./lib/env";
import type { Seed } from "./lib/seed";

/**
 * Auth + header session flow in a real browser against the real API (VITE_DEMO_MODE=false):
 * guest / member header, no guest flash on refresh, protected routes, returnTo, logout, user switch, expiry, outage.
 */
const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));

/** Records whether the guest buttons were EVER in the document, even for a single frame, while the page loads. */
const watchForGuestFlash = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __sawGuest: boolean };
    w.__sawGuest = false;
    const look = () => {
      if (document.querySelector('[data-testid="auth-guest"]')) w.__sawGuest = true;
    };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
    look();
  });
const sawGuest = (page: Page) => page.evaluate(() => (window as unknown as { __sawGuest: boolean }).__sawGuest);

const countMe = (page: Page) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/v1\/auth\/me$/.test(new URL(r.url()).pathname + "")) calls.push(r.url());
  });
  return calls;
};

async function signInThroughForm(page: Page, creds: { email: string; password: string }) {
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(creds.email);
  await page.getByLabel("Password", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const account = (page: Page) => page.getByRole("button", { name: "Account menu" });

test.describe("logged out", () => {
  test("the header shows Sign in and Sign up and nothing that belongs to an account", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("auth-guest").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("auth-guest").getByRole("link", { name: "Sign up" })).toBeVisible();
    await expect(account(page)).toHaveCount(0);
    await expect(page.getByText("Sign out")).toHaveCount(0);
  });

  test("a guest makes no session request at all (there is nothing to verify)", async ({ page }) => {
    const me = countMe(page);
    await page.goto("/");
    await page.waitForTimeout(1500);
    expect(me).toHaveLength(0);
  });

  test("mobile: the menu offers Sign in and Sign up", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // the first click can land before the page is interactive: click until the menu reports open
    await expect(async () => {
      await page.getByRole("button", { name: /(Open|Close) menu/ }).click();
      await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    const nav = page.getByRole("navigation", { name: "Mobile" });
    await expect(nav.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Sign up" })).toBeVisible();
    await ctx.close();
  });

  for (const path of ["/my-list", "/profile", "/history", "/my-library", "/notifications", "/subscription", "/payment-methods", "/admin/dashboard"]) {
    test(`a protected address typed directly (${path}) goes to Sign in and remembers the destination`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/sign-in\\?returnTo=${encodeURIComponent(path).replace(/%/g, "%")}`));
      await expect(page.getByTestId("signin-notice")).toHaveText("Please sign in to continue.");
    });
  }

  test("the player, reader and listener need sign-in, a trailer does not", async ({ page }) => {
    for (const p of [`/watch/${seed.movie.slug}`, `/read/${seed.ebookEpub.slug}`, `/listen/${seed.audiobook.slug}`]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    }
    await page.goto(`/watch/${seed.movie.slug}?trailer=official`);
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain("/sign-in");
  });

  test("an address outside the site is never followed after sign-in", async ({ page }) => {
    for (const bad of ["https://evil.example/steal", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      await page.goto(`/sign-in?returnTo=${encodeURIComponent(bad)}`);
      // an unsafe destination is dropped: no "sign in to continue" notice, and signing in lands on the homepage
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      await expect(page.getByTestId("signin-notice"), `returnTo=${bad} must be ignored`).toHaveCount(0);
    }
    await page.goto(`/sign-in?returnTo=${encodeURIComponent("https://evil.example/steal")}`);
    await signInThroughForm(page, USER);
    await expect(page).toHaveURL(`${WEB}/`);
  });

  for (const [label, path] of [
    ["Movie Play", `/watch/${seed.movie.slug}`],
    ["eBook Reader", `/read/${seed.ebookEpub.slug}`],
    ["Audiobook Player", `/listen/${seed.audiobook.slug}`],
  ] as const) {
    test(`${label}: sign in returns to the page the visitor wanted`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
      await signInThroughForm(page, USER);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
      // Back must not bounce into the sign-in page again
      await page.goBack();
      expect(page.url()).not.toContain("/sign-in?");
    });
  }

  test("signing in with no destination goes to the homepage and the header changes at once", async ({ page }) => {
    await page.goto("/sign-in");
    await signInThroughForm(page, USER);
    await expect(page).toHaveURL(`${WEB}/`);
    await expect(account(page)).toBeVisible();
    await expect(page.getByTestId("auth-guest")).toHaveCount(0);
  });
});

test.describe("logged in", () => {
  test.use({ storageState: USER_STATE });

  test("the header shows the account menu and hides Sign in / Sign up", async ({ page }) => {
    await page.goto("/");
    await expect(account(page)).toBeVisible();
    await expect(page.getByTestId("auth-guest")).toHaveCount(0);
  });

  test("refreshing repeatedly never flashes Sign in / Sign up, and asks the server once", async ({ page }) => {
    await watchForGuestFlash(page);
    const me = countMe(page);
    await page.goto("/");
    await expect(account(page)).toBeVisible();
    for (let i = 0; i < 5; i++) {
      await page.reload();
      await expect(account(page)).toBeVisible();
      expect(await sawGuest(page), `guest buttons appeared on refresh #${i + 1}`).toBe(false);
    }
    // 1 initial load + 5 refreshes = 6 page loads, so exactly 6 session checks (one each, never two)
    expect(me).toHaveLength(6);
  });

  test("a protected page refreshed directly stays put (never bounces through Sign in)", async ({ page }) => {
    const visited: string[] = [];
    page.on("framenavigated", (f) => f === page.mainFrame() && visited.push(f.url()));
    for (const path of ["/my-list", "/profile", "/history", `/read/${seed.ebookEpub.slug}`]) {
      await page.goto(path);
      await page.reload();
      await page.waitForTimeout(1200);
      expect(page.url()).toContain(path);
    }
    expect(visited.filter((u) => u.includes("/sign-in"))).toEqual([]);
  });

  test("the session endpoint is fast and light: 200 + small user for a session, 401 without one", async ({ page, request }) => {
    await page.goto("/");
    const token = await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY);
    const api = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";
    const t0 = Date.now();
    const ok = await request.get(`${api}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const ms = Date.now() - t0;
    expect(ok.status()).toBe(200);
    expect((await ok.body()).length).toBeLessThan(1500);
    expect(ms).toBeLessThan(500);
    expect((await request.get(`${api}/auth/me`)).status()).toBe(401);
  });

  test("a customer opening /admin is told access is required (they are not treated as signed out)", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.getByText("Admin access required")).toBeVisible();
    expect(page.url()).not.toContain("/sign-in");
  });

  test("mobile: the account menu is shown, not Sign in / Sign up", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: USER_STATE, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(account(page)).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(async () => {
      await page.getByRole("button", { name: /(Open|Close) menu/ }).click();
      await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await ctx.close();
  });

  test("signing out updates the header at once, and a refresh stays signed out", async ({ page }) => {
    await page.goto("/");
    await account(page).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto("/");
    await expect(page.getByTestId("auth-guest")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("auth-guest")).toBeVisible();
    await expect(account(page)).toHaveCount(0);
  });
});

test.describe("admin", () => {
  test.use({ storageState: ADMIN_STATE });
  test("an administrator reaches /admin after a refresh, without a bounce through Sign in", async ({ page }) => {
    const visited: string[] = [];
    page.on("framenavigated", (f) => f === page.mainFrame() && visited.push(f.url()));
    await page.goto("/admin/dashboard");
    await page.reload();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain("/admin/dashboard");
    expect(visited.filter((u) => u.includes("/sign-in"))).toEqual([]);
    await expect(page.getByText("Admin access required")).toHaveCount(0);
  });
});

test("one customer never sees another's data after switching accounts", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/sign-in");
  await signInThroughForm(page, USER);
  await expect(account(page)).toBeVisible();
  await expect(account(page)).toContainText("E2E Live User");
  await expect(account(page)).not.toContainText("User B");
  await account(page).click();
  await expect(page.getByText(USER.email)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/");
  await account(page).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  // the browser holds nothing of the first customer any more
  const left = await page.evaluate(() => JSON.stringify(localStorage.getItem("sv-user-v1") ?? ""));
  expect(left).not.toContain(USER.email);

  await signInThroughForm(page, USER_B);
  await expect(account(page)).toContainText("E2E Live User B");
  await account(page).click();
  await expect(page.getByText(USER_B.email)).toBeVisible();
  await expect(page.getByText(USER.email)).toHaveCount(0);
});

test.describe("session problems", () => {
  test("an expired session sends a protected page to Sign in with an expiry message, once (no loop)", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript((k) => localStorage.setItem(k, "expired.or.invalid"), TOKEN_KEY);
    const page = await ctx.newPage();
    const refreshes: string[] = [];
    page.on("request", (r) => r.url().endsWith("/auth/refresh") && refreshes.push(r.url()));
    await page.goto("/my-list");
    // generous: the dev server may still be compiling this page for the first time when the whole suite runs
    await expect(page).toHaveURL(/\/sign-in\?.*reason=expired/, { timeout: 45_000 });
    await expect(page.getByTestId("signin-notice")).toHaveText("Your session has expired. Please sign in again.");
    await page.waitForTimeout(1500);
    expect(refreshes.length).toBeLessThanOrEqual(1);
    await ctx.close();
  });

  test("when the server cannot be reached a known customer stays signed in (nothing is granted, saved downloads still open)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: USER_STATE });
    const page = await ctx.newPage();
    await page.route("**/api/v1/**", (r) => r.abort()); // the whole server is unreachable
    await page.goto("/my-list");
    // not signed out, not bounced to Sign in: the account menu stays and the bar explains why things will not load
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("auth-guest")).toHaveCount(0);
    expect(page.url()).toContain("/my-list");
    await expect(page.getByTestId("connection-banner")).toContainText("We can't reach StreamVerse", { timeout: 15_000 });
    await ctx.close();
  });

  test("with nobody known on the device and the server unreachable, the visitor gets a retry, never a guest page", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: USER_STATE });
    await ctx.addInitScript(() => localStorage.removeItem("sv-last-user"));
    const page = await ctx.newPage();
    await page.route("**/api/v1/auth/me", (r) => r.abort());
    await page.goto("/my-list");
    await expect(page.getByText("We could not verify your session. Please try again.")).toBeVisible();
    expect(page.url()).not.toContain("/sign-in");
    await expect(page.getByTestId("auth-guest")).toHaveCount(0);
    // recovers when the server is back
    await page.unroute("**/api/v1/auth/me");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("We could not verify your session")).toHaveCount(0);
    expect(page.url()).toContain("/my-list");
    await ctx.close();
  });
});
