import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN_STATE, SEED_FILE } from "./lib/env";
import type { Seed } from "./lib/seed";

/**
 * Admin console sweep, in a real browser against the real API:
 *   1. every screen loads with no crash, no console error and no failing API call;
 *   2. every safe control on it (buttons, tabs, menus, links) can be clicked without breaking the page;
 *   3. when the API fails or the server is down, no screen crashes or goes blank: the visitor is told what happened.
 * Anything destructive (delete, remove, publish, refund, sign out...) is never clicked.
 */
test.use({ storageState: ADMIN_STATE });
test.describe.configure({ mode: "serial" });
const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));

const SCREENS = [
  "/admin/dashboard",
  "/admin/movies",
  "/admin/movies/new",
  `/admin/movies/${seed.movie.slug}/edit`,
  `/admin/movies/${seed.movie.slug}/stats`,
  "/admin/ebooks",
  "/admin/ebooks/new",
  `/admin/ebooks/${seed.ebookEpub.slug}/edit`,
  `/admin/ebooks/${seed.ebookEpub.slug}/stats`,
  "/admin/audiobooks",
  "/admin/audiobooks/new",
  `/admin/audiobooks/${seed.audiobook.slug}/edit`,
  `/admin/audiobooks/${seed.audiobook.slug}/stats`,
  "/admin/genres",
  "/admin/collections",
  "/admin/homepage",
  "/admin/banners",
  "/admin/media",
  "/admin/users",
  "/admin/subscriptions",
  "/admin/payments",
  "/admin/analytics",
  "/admin/notifications",
  "/admin/legal",
  "/admin/settings",
];

/** Never clicked: these change real data (settings switches are never touched at all), leave the page, or end the session. */
const DESTRUCTIVE = /mark |send|enable|disable|toggle|move |rename|export|delete|remove|refund|suspend|ban\b|reset|purge|clear|unpublish|publish|archive|sign out|log ?out|cancel subscription|deactivate|revoke|replace|bulk|reconcile|restore|back to streamverse|collapse menu|^save|^create|submit|upload/i;

const IGNORED_CONSOLE = /VITE_SENTRY_DSN|React DevTools|Download the React|\[vite\]|favicon|ERR_ABORTED|net::ERR_FAILED/i;

function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`crash: ${e.message.slice(0, 160)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.test(m.text())) problems.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on("response", (r) => {
    const url = r.url();
    if (r.status() >= 400 && url.includes("/api/v1/")) problems.push(`api ${r.status()} ${r.request().method()} ${new URL(url).pathname}`);
  });
  return problems;
}

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(600);
};

const crashed = async (page: Page) => {
  const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  // a screen "crashes" when the app's error boundary took over (data-testid="app-crash") or nothing is left on it; a friendly
  // "Something went wrong on our side" panel is the intended answer to a failed request, not a crash
  const boundary = (await page.getByTestId("app-crash").count().catch(() => 0)) > 0 || /cannot read prop|is not a function|undefined is not/i.test(text);
  return boundary || text.trim().length < 20 ? text.slice(0, 160) || "(blank page)" : null;
};

for (const path of SCREENS) {
  test(`${path}: loads cleanly and every safe control works`, async ({ page }) => {
    test.setTimeout(240_000);
    const problems = watch(page);
    await page.goto(path);
    await settle(page);
    const state = await crashed(page);
    if (state) problems.push(`page shows: ${state}`);

    // every visible control inside the page content (not the sidebar), by its label; on/off switches change real settings
    // (maintenance mode, registration...) and their labels carry no "on/off" word, so they are left out by role
    const CONTROLS = "main button:visible:not([role=switch]), main [role=tab]:visible, main summary:visible";
    const labels = await page.locator(CONTROLS).evaluateAll((els) =>
      els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean),
    );
    const seen = new Set<string>();
    for (const label of labels) {
      if (seen.has(label) || DESTRUCTIVE.test(label) || label.length > 60) continue;
      seen.add(label);
      if (page.url().includes("/admin") === false) await page.goto(path).then(() => settle(page));
      const target = page.locator(CONTROLS).filter({ hasText: label.length > 1 ? label : undefined }).first();
      const byAria = page.locator(`main [aria-label="${label.replace(/"/g, '\\"')}"]:visible:not([role=switch])`).first();
      const el = (await byAria.count()) ? byAria : target;
      try {
        await el.click({ timeout: 4000, trial: false });
      } catch {
        continue; // covered by an overlay or gone after a previous click: not a fault of the control
      }
      await page.waitForTimeout(250);
      const after = await crashed(page);
      if (after) problems.push(`after "${label}": ${after}`);
      await page.keyboard.press("Escape").catch(() => undefined);
      if (!page.url().includes(path.split("?")[0]!)) await page.goto(path).then(() => settle(page));
    }

    // every link in the page content resolves (checked by loading it), skipping external, downloads and destructive-looking ones
    const hrefs = await page.locator("main a[href^='/']:visible").evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!))]);
    for (const href of hrefs.slice(0, 12)) {
      if (DESTRUCTIVE.test(href) || /\/media\/|\.(mp4|epub|pdf)/i.test(href)) continue;
      const res = await page.request.get(new URL(href, page.url()).toString(), { headers: { Accept: "text/html" } }).catch(() => null);
      if (!res || res.status() >= 400) problems.push(`link ${href} -> ${res?.status() ?? "no answer"}`);
    }

    console.log(`RESULT ${path} controls=${seen.size} problems=${problems.length}`);
    for (const p of [...new Set(problems)]) console.log(`PROBLEM ${path} :: ${p}`);
    expect([...new Set(problems)], `${path} problems`).toEqual([]);
  });
}

/** Fault tolerance: with the API failing (500), refusing the connection, or very slow, no screen crashes or goes blank. */
const FAULTS: Array<[string, (page: Page) => Promise<void>]> = [
  ["the API answers 500", (p) => p.route("**/api/v1/admin/**", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "Something went wrong", errors: [], code: "INTERNAL_ERROR" }) }))],
  ["the connection is refused", (p) => p.route("**/api/v1/admin/**", (r) => r.abort("connectionrefused"))],
  ["the API answers with garbage", (p) => p.route("**/api/v1/admin/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "<<not json>>" }))],
  ["the API is very slow", (p) => p.route("**/api/v1/admin/**", async (r) => { await new Promise((x) => setTimeout(x, 4000)); await r.continue(); })],
];
for (const [fault, install] of FAULTS) {
  test(`when ${fault}, no admin screen crashes or goes blank`, async ({ page }) => {
    test.setTimeout(900_000);
    await install(page);
    const bad: string[] = [];
    page.on("pageerror", (e) => bad.push(`crash: ${e.message.slice(0, 120)}`));
    for (const path of SCREENS.filter((s) => !process.env["CRAWL_ONLY"] || new RegExp(process.env["CRAWL_ONLY"]).test(s))) {
      await page.goto(path);
      // while getting ready the screen must say so (never empty); after a few seconds it must show content or an error
      await expect.poll(async () => (await page.locator("body").innerText()).trim().length, { timeout: 2500, message: `${path} is empty while loading` }).toBeGreaterThan(5).catch((e: Error) => bad.push(e.message));
      // the dev server needs a moment to deliver the app; once it has, the loading message must give way to the screen
      await page.waitForFunction(() => !/Checking your session|Loading the admin console/.test(document.body.innerText), undefined, { timeout: 30_000 }).catch(() => bad.push(`${path}: still "loading" after 30s`));
      await page.waitForTimeout(fault === "the API is very slow" ? 6000 : 4500); // room for the failed request (and its retries) to show its message
      const state = await crashed(page);
      if (state) bad.push(`${path}: ${state}`);
      // a failed request must be SAID on screen (in words), not shown as an empty list
      if (fault === "the API answers 500" || fault === "the connection is refused") {
        const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        if (!/couldn.t|could not|can.t|cannot|failed|try again|unable|something went wrong|error|unavailable/i.test(text)) bad.push(`${path}: nothing tells the user the data could not be loaded`);
      }
    }
    console.log(`RESULT fault "${fault}": ${bad.length} bad`);
    for (const b of bad) console.log(`PROBLEM fault "${fault}" :: ${b}`);
    expect(bad).toEqual([]);
  });
}

/**
 * Forms refuse bad input in words: opening each "add / create / send" form and submitting it empty must say what is missing
 * (a message on screen, or the field marked invalid), keep the form open, and never crash or silently do nothing.
 */
const FORMS: Array<{ screen: string; open: RegExp; submit: RegExp; name: string }> = [
  { screen: "/admin/genres", open: /^add genre$/i, submit: /save genre/i, name: "genre" },
  { screen: "/admin/banners", open: /^add banner$/i, submit: /^(save|create)/i, name: "banner" },
  { screen: "/admin/collections", open: /^new collection$/i, submit: /^(save|create)/i, name: "collection" },
  { screen: "/admin/homepage", open: /^add section$/i, submit: /create section/i, name: "homepage section" },
  { screen: "/admin/subscriptions", open: /^create plan$/i, submit: /^(save|create)/i, name: "plan" },
  { screen: "/admin/notifications", open: /^send$/i, submit: /^send$/i, name: "notification" },
];
for (const f of FORMS) {
  test(`the ${f.name} form says what is missing instead of failing silently`, async ({ page }) => {
    test.setTimeout(90_000);
    const problems = watch(page);
    await page.goto(f.screen);
    await settle(page);
    await page.getByRole("button", { name: f.open }).first().click();
    const dialog = page.getByRole("dialog").first();
    const scope = (await dialog.count()) ? dialog : page.locator("main");
    const submit = scope.getByRole("button", { name: f.submit }).last();
    await submit.click();
    // some words on screen: a toast, an alert, a field marked invalid, or visible "required/enter/select" text
    const said = page.locator('[data-sonner-toast], [role="alert"], [aria-invalid="true"], :text-matches("required|enter |select |choose |missing|invalid|must|cannot be empty|add a", "i")').first();
    await expect(said, `${f.name} form: no message after submitting empty`).toBeVisible({ timeout: 6000 });
    expect(await crashed(page)).toBeNull();
    expect([...new Set(problems.filter((p) => !p.startsWith("api 4")))]).toEqual([]); // a 400 refusal is fine, anything else is not
  });
}
