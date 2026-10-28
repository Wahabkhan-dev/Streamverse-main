import { expect, test } from "@playwright/test";

/**
 * The installable-app pieces, in real Chromium: the manifest and icons are valid, Chrome itself finds no reason the app
 * cannot be installed, and the service worker shows the offline page when there is no connection.
 */
test("the manifest and icons are served and Chrome reports the app as installable", async ({ page, context, baseURL }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const manifest = (await (await page.request.get(`${baseURL}${href}`)).json()) as { name: string; display: string; start_url: string; icons: Array<{ src: string; sizes: string; purpose?: string }> };
  expect(manifest).toMatchObject({ name: "StreamVerse", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await page.request.get(`${baseURL}${icon.src}`)).status(), icon.src).toBe(200);
  expect(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  expect(await page.locator('meta[name="theme-color"]').getAttribute("content")).toBe("#070707");
  expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBe(1);

  // Chrome's own installability check (needs a service worker with a fetch handler)
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: Array<{ errorId: string }> };
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
});

test("with no connection a page shows the offline screen, and it comes back online", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  // make sure this page is controlled by the worker before going offline
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.goto("/movies").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "You're offline" })).toHaveCount(0, { timeout: 15_000 });
});

test("the offline screen tells 'no internet' apart from 'StreamVerse cannot be reached'", async ({ page }) => {
  // online, but this is the screen a visitor sees when the server is down or blocked
  await page.goto("/offline.html");
  await expect(page.getByRole("heading", { name: "We can't reach StreamVerse" })).toBeVisible();
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await page.context().setOffline(false);
});

test("the service worker registers by itself when the site opens (no manual step)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? null), { timeout: 60_000 }).toBe("activated");
});

test.describe("connection bar", () => {
  test("a slim bar (not a blocking screen) shows on any page while offline and leaves when the internet returns", async ({ page, context }) => {
    for (const path of ["/", "/sign-in"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("connection-banner")).toHaveCount(0);
      await context.setOffline(true);
      await expect(page.getByTestId("connection-banner")).toContainText("You're offline");
      // the page itself is still there and usable
      await expect(page.locator("header").first()).toBeVisible();
      await context.setOffline(false);
      await expect(page.getByTestId("connection-banner")).toHaveCount(0, { timeout: 10_000 });
    }
  });

  test("when only StreamVerse's server cannot be reached, the bar says so, retries, and clears when it answers again", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.route("**/api/v1/**", (r) => r.abort("connectionrefused"));
    await page.getByRole("link", { name: "Movies", exact: true }).first().click();
    await expect(page.getByTestId("connection-banner")).toContainText("We can't reach StreamVerse", { timeout: 15_000 });
    await page.unroute("**/api/v1/**");
    await page.getByRole("button", { name: "Retry now" }).click();
    await expect(page.getByTestId("connection-banner")).toHaveCount(0, { timeout: 15_000 });
  });
});

/**
 * The installed app has no browser toolbar, so the app shows its own Back and Forward. A test browser can't be installed,
 * so the page is told it runs in an app window (the same media query the installed app matches).
 */
const asInstalledApp = () => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q: string) => {
    const m = real(q);
    if (!q.includes("display-mode: standalone")) return m;
    // a plain object: MediaQueryList's own `matches` can't be overwritten
    return { matches: true, media: q, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false } as MediaQueryList;
  };
};

test.describe("installed app: back and forward", () => {
  for (const who of [
    { name: "customer site", state: "user.json", start: "/movies", next: /^\/ebooks/, go: "eBooks" },
    { name: "admin console", state: "admin.json", start: "/admin/movies", next: /^\/admin\/ebooks/, go: "eBooks" },
  ] as const) {
    test(`${who.name}: Back and Forward buttons move through the pages`, async ({ browser, baseURL }) => {
      const { STATE_DIR } = await import("./lib/env");
      const context = await browser.newContext({ storageState: `${STATE_DIR}/${who.state}` });
      await context.addInitScript(asInstalledApp);
      const page = await context.newPage();
      await page.goto(`${baseURL}${who.start}`);
      const nav = page.getByTestId("app-nav");
      await expect(nav).toBeVisible({ timeout: 30_000 });
      const path = () => new URL(page.url()).pathname;

      await page.getByRole("link", { name: who.go, exact: true }).first().click();
      await expect.poll(path).toMatch(who.next);
      await nav.getByRole("button", { name: "Go back" }).click();
      await expect.poll(path).toBe(who.start);
      await expect(nav.getByRole("button", { name: "Go forward" })).toBeEnabled();
      await nav.getByRole("button", { name: "Go forward" }).click();
      await expect.poll(path).toMatch(who.next);
      // nothing ahead now, so Forward is greyed out
      await expect(nav.getByRole("button", { name: "Go forward" })).toBeDisabled();
      await context.close();
    });
  }

  test("a normal browser tab shows no extra buttons (it has its own)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.getByTestId("app-nav")).toHaveCount(0);
  });
});
