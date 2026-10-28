import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN_STATE, SEED_FILE, USER_STATE } from "./lib/env";
import { track } from "./lib/net";
import type { Seed } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));

/** The page's own data requests have completed (the dev server's HMR socket never goes network-idle by itself). */
const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(800);
};

test.describe("customer pages: no failing API calls, no duplicates, bounded request counts", () => {
  test.use({ storageState: USER_STATE });
  const pages: Array<{ name: string; path: string; maxCalls: number }> = [
    { name: "Homepage", path: "/", maxCalls: 8 },
    { name: "Movies", path: "/movies", maxCalls: 3 },
    { name: "eBooks", path: "/ebooks", maxCalls: 3 },
    { name: "Audiobooks", path: "/audiobooks", maxCalls: 3 },
    { name: "Movie detail", path: `/movies/${seed.movie.slug}`, maxCalls: 6 },
    { name: "Search", path: "/search", maxCalls: 5 },
    { name: "My List", path: "/my-list", maxCalls: 4 },
    { name: "My Library", path: "/my-library", maxCalls: 4 },
    { name: "History", path: "/history", maxCalls: 4 },
  ];
  for (const p of pages) {
    test(`${p.name}`, async ({ page }) => {
      const net = track(page);
      await page.goto(p.path);
      await settle(page);
      console.log(`[requests] ${p.name}: ${net.calls.length} API calls`);
      expect(net.bad(), "no 404/5xx").toEqual([]);
      expect(net.pageErrors, "no uncaught page errors").toEqual([]);
      expect(net.duplicates(), "the same GET must not be fired twice").toEqual([]);
      expect(net.calls.length, `API call budget for ${p.name}`).toBeLessThanOrEqual(p.maxCalls);
    });
  }
});

test.describe("admin pages: no failing API calls, no duplicates", () => {
  test.use({ storageState: ADMIN_STATE });
  const pages: Array<{ name: string; path: string; maxCalls: number }> = [
    { name: "Dashboard", path: "/admin/dashboard", maxCalls: 8 },
    { name: "Movies", path: "/admin/movies", maxCalls: 3 },
    { name: "eBooks", path: "/admin/ebooks", maxCalls: 3 },
    { name: "Audiobooks", path: "/admin/audiobooks", maxCalls: 3 },
    { name: "Homepage CMS", path: "/admin/homepage", maxCalls: 4 },
    { name: "Users", path: "/admin/users", maxCalls: 4 },
    { name: "Settings", path: "/admin/settings", maxCalls: 5 },
  ];
  for (const p of pages) {
    test(`${p.name}`, async ({ page }) => {
      const net = track(page);
      await page.goto(p.path);
      await settle(page);
      console.log(`[requests] admin ${p.name}: ${net.calls.length} API calls`);
      expect(net.bad(), "no 404/5xx").toEqual([]);
      expect(net.pageErrors).toEqual([]);
      expect(net.duplicates()).toEqual([]);
      expect(net.calls.length, `API call budget for admin ${p.name}`).toBeLessThanOrEqual(
        p.maxCalls,
      );
    });
  }
});

test.describe("anonymous visitor", () => {
  for (const path of ["/sign-in", "/", "/movies", "/ebooks"]) {
    test(`${path} never calls /auth/refresh and never reload-loops`, async ({ page }) => {
      const net = track(page);
      let navigations = 0;
      page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) navigations++;
      });
      await page.goto(path);
      await page.waitForTimeout(5000);
      expect(net.count("/auth/refresh"), "an anonymous visitor has no session to refresh").toBe(0);
      expect(navigations, "no redirect/reload loop").toBeLessThanOrEqual(2);
    });
  }
});
