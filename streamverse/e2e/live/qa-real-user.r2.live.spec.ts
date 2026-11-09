import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Api } from "./lib/api";
import { asAdmin } from "./lib/auth";
import { closeDb, db } from "./lib/db";
import { API, SEED_FILE, TOKEN_KEY } from "./lib/env";
import { track } from "./lib/net";
import type { Seed } from "./lib/seed";
import { deliverWebhook, payWithTestCard, stripe } from "./lib/stripe";

/**
 * REAL-USER QA: guest, signed-in without a plan, restricted plan, subscriber, cancelled, returning user — in a real
 * browser, against the real API, MySQL, R2 and Stripe TEST mode (VITE_DEMO_MODE=false). Every important write is checked
 * in MySQL (or at Stripe), never only on screen. Accounts are named qa-*@streamverse.test.
 *
 * The seeded titles are PUBLIC (free for anyone signed in). To test paid-only access they are switched to SUBSCRIBERS_ONLY
 * for this file and switched back in afterAll.
 */
// one worker, in file order (playwright.live.config.ts). Not "serial": a failure must not hide the results of the rest;
// the few tests that build on the sign-up test skip themselves when it did not produce a customer.
const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
const RUN = Date.now();
const PASSWORD = "Qa-Real-User-Pass-1!";
const qaEmail = (tag: string) => `qa-${tag}-${RUN}@streamverse.test`;

type Json = Record<string, any>;
let admin: Api;
let plans: Json[] = [];
const planBy = (slug: string) => plans.find((p) => p["slug"] === slug)!;
const accounts: Record<string, { email: string; api: Api; userId: string }> = {};
const restore: Array<() => Promise<unknown>> = [];

async function register(tag: string) {
  const email = qaEmail(tag);
  const res = await new Api().post<Json>("/auth/register", { email, password: PASSWORD, fullName: `QA ${tag}` });
  return { email, api: new Api(res.data["accessToken"]), userId: String(res.data["user"]["id"]) };
}

/** The app's own payment flow (payment-intent), paid with a Stripe test card at Stripe, then the app syncs from Stripe. */
async function subscribe(api: Api, planSlug: string) {
  const intent = await api.post<Json>("/me/subscription/payment-intent", { planId: planBy(planSlug)["id"] });
  await payWithTestCard(String(intent.data["clientSecret"]));
  await expect.poll(async () => (await api.post<Json>("/me/subscription/sync")).data["status"], { timeout: 30_000 }).toBe("ACTIVE");
}

/** Whatever the current contract is, a denial must say why, must not be "sign in", and must not hand out a file. */
async function consume(api: Api, kind: "movie" | "ebook" | "audiobook", id: string) {
  const path = kind === "movie" ? `/media/movies/${id}/playback` : kind === "ebook" ? `/media/ebooks/${id}/access` : `/media/audiobooks/${id}/playback`;
  const res = await api.raw("POST", path, {});
  const body = (await res.json().catch(() => ({}))) as Json;
  const data = (body["data"] ?? {}) as Json;
  const url = data["playback"]?.["url"] ?? data["signedUrl"] ?? null;
  return { status: res.status, ok: !!data["access"]?.["canConsume"] && !!url, reason: data["access"]?.["reason"] ?? body["code"], message: data["access"]?.["message"] ?? body["message"], url, sessionId: data["sessionId"] as string | undefined };
}
const endStream = (api: Api, sessionId?: string) => (sessionId ? api.raw("POST", `/me/playback-sessions/${sessionId}/end`, {}) : Promise.resolve());

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 20_000 });
}
async function newPage(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  return { page, ctx, net: track(page) };
}
async function fillCard(page: Page, number: string) {
  const frame = page.frameLocator('iframe[title*="Secure payment input"]').first();
  await frame.getByLabel("Card number").fill(number);
  await frame.getByLabel("Expiration date").fill("12 / 34");
  await frame.getByLabel("Security code").fill("123");
  const zip = frame.getByLabel(/ZIP|Postal/i);
  if (await zip.count()) await zip.fill("12345");
}
/** No crash, no React error, no failing API call (404 / 5xx) on a page. */
const clean = (net: ReturnType<typeof track>, label: string) => {
  expect(net.pageErrors, `${label}: page errors`).toEqual([]);
  expect(net.bad(), `${label}: failing API calls`).toEqual([]);
};

test.beforeAll(async () => {
  admin = asAdmin();
  plans = (await new Api().get<Json[]>("/plans")).data;
  for (const [kind, item] of [["movies", seed.movie], ["ebooks", seed.ebookEpub], ["audiobooks", seed.audiobook]] as const) {
    await admin.put(`/admin/${kind}/${item.id}`, { visibility: "SUBSCRIBERS_ONLY" });
    restore.push(() => admin.put(`/admin/${kind}/${item.id}`, { visibility: "PUBLIC" }));
  }
  accounts["nosub"] = await register("nosub");
  accounts["basic"] = await register("basic");
  await subscribe(accounts["basic"].api, "basic");
});

test.afterAll(async () => {
  for (const r of restore.reverse()) await r().catch((e) => console.error("restore failed:", e));
  await closeDb();
});

/* ─────────────────────────────── guest ─────────────────────────────── */

test("guest: every public page opens without signing in, with no failing calls", async ({ page }) => {
  const net = track(page);
  const collections = (await new Api().get<Json[]>("/collections")).data ?? [];
  const pages = [
    "/", "/movies", `/movies/${seed.movie.slug}`, "/ebooks", `/ebooks/${seed.ebookEpub.slug}`, "/audiobooks", `/audiobooks/${seed.audiobook.slug}`,
    "/search?q=E2E", "/collections", ...(collections[0] ? [`/collections/${collections[0]["slug"]}`] : []),
    "/signup/plan", "/privacy-policy", "/terms-and-conditions", "/refund-policy",
  ];
  for (const p of pages) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    expect(page.url(), `${p} must not ask a guest to sign in`).not.toContain("/sign-in");
    await expect(page.locator("h1").first(), `${p} shows its content`).toBeVisible();
  }
  // plans on the sign-up page are the backend's plans, with the backend's prices
  await page.goto("/signup/plan");
  for (const p of plans) {
    await expect(page.getByRole("button", { name: new RegExp(String(p["name"])) }).first()).toBeVisible();
    await expect(page.getByText(`$${(Number(p["priceAmount"] ?? p["price"]) / 100).toFixed(2)}`).first()).toBeVisible();
  }
  // the site header (the sign-up pages have their own slim header): Sign in / Join, and nothing that belongs to an account
  await page.goto("/");
  await expect(page.getByTestId("auth-guest").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
  expect(net.calls.filter((c) => c.path.startsWith("/media/")), "a guest asks for no media").toEqual([]);
  // a legal page the admin has not published yet answers 404 by design (its page still shows a heading); every other call must succeed
  const unpublished: string[] = [];
  for (const doc of ["privacy-policy", "terms-and-conditions", "refund-policy"]) if ((await new Api().raw("GET", `/legal/${doc}`)).status === 404) unpublished.push(`/legal/${doc}`);
  if (unpublished.length) console.log(`[qa] NOT PUBLISHED in this database: ${unpublished.join(", ")}`);
  expect(net.pageErrors).toEqual([]);
  expect(net.bad().filter((c) => !(c.status === 404 && unpublished.includes(c.path))), "guest browsing: failing API calls").toEqual([]);
});

test("guest: Play, Read, Listen and My List open a sign-in prompt and nothing protected is requested", async ({ page }) => {
  const net = track(page);
  const checks: Array<[string, string, RegExp, string]> = [
    [`/movies/${seed.movie.slug}`, "link", /^(Play|Resume)$/, `/watch/${seed.movie.slug}`],
    [`/ebooks/${seed.ebookEpub.slug}`, "link", /Read Now|Continue Reading/, `/read/${seed.ebookEpub.slug}`],
    [`/audiobooks/${seed.audiobook.slug}`, "link", /^(Play|Resume)$/, `/listen/${seed.audiobook.slug}`],
  ];
  for (const [detail, role, name, player] of checks) {
    await page.goto(detail);
    await page.waitForLoadState("networkidle");
    await page.getByRole(role as "link", { name }).first().click();
    const prompt = page.getByTestId("signin-prompt");
    await expect(prompt).toBeVisible();
    expect(page.url(), "the guest stays on the title page").toContain(detail);
    await expect(prompt.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", new RegExp(`returnTo=${encodeURIComponent(player).replace(/%2F/g, "(%2F|/)")}`));
    await expect(prompt.getByRole("link", { name: "Join StreamVerse" })).toBeVisible();
    await prompt.getByRole("button", { name: "Continue browsing" }).click();
    await expect(prompt).toBeHidden();
    // saving needs an account too
    await page.getByRole("button", { name: /My List/ }).first().click();
    await expect(page.getByTestId("signin-prompt")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("signin-prompt")).toBeHidden();
  }
  expect(net.calls.filter((c) => c.path.startsWith("/media/") || c.path.startsWith("/me/")), "no protected request for a guest").toEqual([]);
  // the prompt's Sign In carries the visitor to the player afterwards (sign-in + returnTo itself is covered in auth-session)
  await page.goto(`/movies/${seed.movie.slug}`);
  await page.getByRole("link", { name: /^(Play|Resume)$/ }).first().click();
  await page.getByTestId("signin-prompt").getByRole("link", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fwatch%2F/);
  clean(net, "guest gates");
});

test("direct API without a session: protected endpoints answer 401 and hand out nothing", async () => {
  const anon = new Api();
  const paths: Array<[string, string]> = [
    ["POST", `/media/movies/${seed.movie.id}/playback`], ["POST", `/media/ebooks/${seed.ebookEpub.id}/access`], ["POST", `/media/audiobooks/${seed.audiobook.id}/playback`],
    ["POST", `/media/offline/${seed.movie.id}/authorize`],
    ["GET", "/me/profile"], ["GET", "/me/my-list"], ["GET", "/me/library"], ["GET", "/me/history"], ["GET", "/me/continue"], ["GET", "/me/notifications"],
    ["GET", "/me/subscription"], ["GET", "/me/payment-methods"], ["GET", "/me/payments"], ["GET", "/me/devices"], ["GET", `/me/progress/movie/${seed.movie.id}`],
    ["GET", "/admin/users"], ["GET", "/admin/media"],
  ];
  for (const [m, p] of paths) {
    const res = await anon.raw(m, p, m === "POST" ? {} : undefined);
    const text = await res.text();
    expect(res.status, `${m} ${p}`).toBe(401);
    expect(text, `${m} ${p} leaks nothing`).not.toMatch(/X-Amz-|\.m3u8|signedUrl/);
  }
});

test("public title pages carry public details only: no stream, book or audio file links", async () => {
  const anon = new Api();
  for (const p of [`/movies/${seed.movie.slug}`, `/ebooks/${seed.ebookEpub.slug}`, `/ebooks/${seed.ebookPdf.slug}`, `/audiobooks/${seed.audiobook.slug}`]) {
    const text = await (await anon.raw("GET", p)).text();
    expect(text, `${p}: no protected file link`).not.toMatch(/\.(m3u8|mp4|epub|pdf|mp3|m4a|aac|wav)(\?|")/i);
    expect(text, `${p}: no storage keys or playback urls`).not.toMatch(/"(storageKey|hlsManifestKey|signedUrl|playbackUrl|fileUrl)"/);
    expect(text, `${p}: no credentials`).not.toMatch(/AccessKeyId|SecretAccessKey|sk_test_|sk_live_/);
  }
});

/* ─────────────────────────────── signed in, no plan ─────────────────────────────── */

test("signed in without a subscription: Play, Read and Listen say 'choose a plan', never 'sign in'", async ({ browser }) => {
  const nosub = accounts["nosub"]!;
  for (const [kind, item] of [["movie", seed.movie], ["ebook", seed.ebookEpub], ["audiobook", seed.audiobook]] as const) {
    const r = await consume(nosub.api, kind, item.id);
    expect(r.status, `${kind}: identity is known, so not 401`).not.toBe(401);
    expect(r.ok, `${kind}: no access`).toBe(false);
    expect(r.url, `${kind}: no file link`).toBeNull();
    expect(r.reason, `${kind}`).toBe("SUBSCRIPTION_REQUIRED");
  }
  const { page, ctx, net } = await newPage(browser);
  await signIn(page, nosub.email);
  for (const p of [`/watch/${seed.movie.slug}`, `/read/${seed.ebookEpub.slug}`, `/listen/${seed.audiobook.slug}`]) {
    await page.goto(p);
    await expect(page.getByText(/for subscribers|choose a plan/i).first(), `${p}`).toBeVisible({ timeout: 20_000 });
    expect(page.url(), `${p}: not sent to sign in`).not.toContain("/sign-in");
  }
  clean(net, "no subscription");
  await ctx.close();
});

/* ─────────────────────────────── restricted plan ─────────────────────────────── */

test("Basic plan (no audiobooks): Listen says the plan does not include audiobooks; movies and eBooks open", async ({ browser }) => {
  const basic = accounts["basic"]!;
  const movie = await consume(basic.api, "movie", seed.movie.id);
  expect(movie.ok).toBe(true);
  await endStream(basic.api, movie.sessionId);
  expect((await consume(basic.api, "ebook", seed.ebookEpub.id)).ok).toBe(true);
  const audio = await consume(basic.api, "audiobook", seed.audiobook.id);
  expect(audio.ok).toBe(false);
  expect(audio.status).not.toBe(401);
  expect(audio.reason).toBe("PLAN_NOT_ELIGIBLE");
  expect(audio.url).toBeNull();

  const { page, ctx, net } = await newPage(browser);
  await signIn(page, basic.email);
  await page.goto(`/listen/${seed.audiobook.slug}`);
  await expect(page.getByText(/plan doesn't include audiobooks/i).first()).toBeVisible({ timeout: 20_000 });
  expect(page.url()).not.toContain("/sign-in");
  clean(net, "wrong plan");
  await ctx.close();
});

test("device limit (Basic: 1): a second device is refused with a clear message; removing one frees the slot", async () => {
  const basic = accounts["basic"]!;
  const existing = (await basic.api.get<Json[]>("/me/devices")).data;
  for (const d of existing) await basic.api.del(`/me/devices/${d["id"]}`);
  await basic.api.post("/me/devices/register", { deviceIdentifier: `qa-dev-1-${RUN}`, deviceName: "QA laptop" });
  const second = await basic.api.raw("POST", "/me/devices/register", { deviceIdentifier: `qa-dev-2-${RUN}`, deviceName: "QA phone" });
  const body = (await second.json()) as Json;
  expect(second.status).toBe(403);
  expect(body["code"]).toBe("DEVICE_LIMIT_REACHED");
  expect(String(body["message"])).toMatch(/1 device/i);
  const listed = (await basic.api.get<Json[]>("/me/devices")).data;
  expect(listed.map((d) => d["deviceName"])).toEqual(["QA laptop"]);
  expect(await db().device.count({ where: { userId: basic.userId, status: "ACTIVE" } })).toBe(1);
  await basic.api.del(`/me/devices/${listed[0]!["id"]}`);
  await basic.api.post("/me/devices/register", { deviceIdentifier: `qa-dev-2-${RUN}`, deviceName: "QA phone" });
  expect((await basic.api.get<Json[]>("/me/devices")).data.map((d) => d["deviceName"])).toEqual(["QA phone"]);
});

test("stream limit (Basic: 1): a second stream is refused, reading does not count, ending frees it, a stale stream expires", async () => {
  const basic = accounts["basic"]!;
  await db().playbackSession.updateMany({ where: { userId: basic.userId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });
  const first = await consume(basic.api, "movie", seed.movie.id);
  expect(first.ok).toBe(true);
  const second = await consume(basic.api, "movie", seed.movie.id);
  expect(second.status).toBe(403);
  expect(second.reason).toBe("CONCURRENT_STREAM_LIMIT_REACHED");
  expect(String(second.message)).toMatch(/1 stream/i);
  expect((await consume(basic.api, "ebook", seed.ebookEpub.id)).ok, "reading an eBook is not a stream").toBe(true);
  // ending playback releases the slot
  await endStream(basic.api, first.sessionId);
  expect((await db().playbackSession.findUnique({ where: { id: first.sessionId } }))["status"]).not.toBe("ACTIVE");
  const third = await consume(basic.api, "movie", seed.movie.id);
  expect(third.ok).toBe(true);
  // a player that disappears (no end, no heartbeat) stops counting once its heartbeat is old
  await db().playbackSession.update({ where: { id: third.sessionId }, data: { lastHeartbeatAt: new Date(Date.now() - 6 * 60 * 60 * 1000) } });
  const fourth = await consume(basic.api, "movie", seed.movie.id);
  expect(fourth.ok, "the stale stream no longer blocks").toBe(true);
  expect((await db().playbackSession.findUnique({ where: { id: third.sessionId } }))["status"]).toBe("EXPIRED");
  await endStream(basic.api, fourth.sessionId);
});

test("age restriction: unverified → asked to verify; too young → refused; old enough → plays (detail page agrees)", async ({ browser }) => {
  const basic = accounts["basic"]!;
  const before = await db().content.findUnique({ where: { id: seed.movie.id } });
  await admin.put(`/admin/movies/${seed.movie.id}`, { age: { ageRestricted: true, minimumAge: 18, ageRating: "18+" } });
  const undoAge = () => admin.put(`/admin/movies/${seed.movie.id}`, { age: { ageRestricted: before["ageRestricted"], ...(before["minimumAge"] !== null ? { minimumAge: before["minimumAge"] } : {}), ...(before["ageRating"] ? { ageRating: before["ageRating"] } : {}) } });
  restore.push(undoAge); // safety net if this test stops early
  test.info().annotations.push({ type: "cleanup", description: "age rule removed at the end of this test" });
  expect((await db().content.findUnique({ where: { id: seed.movie.id } }))["ageRestricted"], "the admin change is stored").toBe(true);
  const detailAccess = async () => (await basic.api.get<Json>(`/movies/${seed.movie.slug}`)).data["access"];
  const r1 = await consume(basic.api, "movie", seed.movie.id);
  expect(r1.reason).toBe("AGE_NOT_VERIFIED");
  expect((await detailAccess())["canConsume"]).toBe(false);

  // the device-limit test left this Basic (1 device) account's slot taken: free it, or the player is (rightly) refused for that
  for (const d of (await basic.api.get<Json[]>("/me/devices")).data) await basic.api.del(`/me/devices/${d["id"]}`);
  // the customer confirms a date of birth on Profile (the real endpoint), first one that is too young
  const { page, ctx, net } = await newPage(browser);
  await signIn(page, basic.email);
  await page.goto("/profile");
  await expect(page.getByTestId("age-status")).toHaveText("Age not confirmed");
  const young = new Date();
  young.setFullYear(young.getFullYear() - 15);
  await page.getByLabel("Date of birth").fill(young.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Confirm age" }).click();
  await expect(page.getByTestId("age-status")).toHaveText("Age confirmed");
  const r2 = await consume(basic.api, "movie", seed.movie.id);
  expect(r2.ok).toBe(false);
  expect(r2.reason).toBe("AGE_RESTRICTED");
  expect((await detailAccess())["canConsume"], "the title page does not promise what the player refuses").toBe(false);
  await page.goto(`/watch/${seed.movie.slug}`);
  await expect(page.getByText(/rated above the age/i).first()).toBeVisible({ timeout: 20_000 });

  await page.goto("/profile");
  await page.getByLabel("Date of birth").fill("1990-05-20");
  await page.getByRole("button", { name: "Confirm age" }).click();
  await expect(page.getByText("Age confirmed").first()).toBeVisible();
  await expect.poll(async () => (await consume(basic.api, "movie", seed.movie.id).then(async (r) => (await endStream(basic.api, r.sessionId), r.ok)))).toBe(true);
  expect((await detailAccess())["canConsume"]).toBe(true);
  const stored = await db().userAgeVerification.findUnique({ where: { userId: basic.userId } });
  expect(stored["verifiedAge"]).toBeGreaterThanOrEqual(30);
  clean(net, "age");
  await ctx.close();
  await undoAge(); // the titles go back to how they were before the next test
});

test("cancel keeps access to the period end, resume undoes it; a subscription ended at Stripe denies access but browsing works", async () => {
  const basic = accounts["basic"]!;
  const cancelled = await basic.api.post<Json>("/me/subscription/cancel");
  expect(cancelled.data["cancelAtPeriodEnd"]).toBe(true);
  const stillOk = await consume(basic.api, "movie", seed.movie.id);
  expect(stillOk.ok, "paid until the period ends").toBe(true);
  await endStream(basic.api, stillOk.sessionId);
  expect((await basic.api.post<Json>("/me/subscription/resume")).data["cancelAtPeriodEnd"]).toBe(false);

  // the subscription really ends (at Stripe); the app learns it from Stripe, not from the browser
  const row = await db().subscription.findUnique({ where: { userId: basic.userId } });
  await stripe("DELETE", `/subscriptions/${row["stripeSubscriptionId"]}`);
  await expect.poll(async () => (await basic.api.post<Json>("/me/subscription/sync")).data["status"], { timeout: 30_000 }).toBe("CANCELED");
  const denied = await consume(basic.api, "movie", seed.movie.id);
  expect(denied.ok).toBe(false);
  expect(denied.status).not.toBe(401);
  expect(["SUBSCRIPTION_INACTIVE", "SUBSCRIPTION_REQUIRED"]).toContain(denied.reason);
  expect((await basic.api.raw("GET", "/movies?page=1&limit=5")).status, "public browsing still works").toBe(200);
  expect((await basic.api.raw("GET", `/movies/${seed.movie.slug}`)).status).toBe(200);
});

/* ─────────────────────────────── a new customer, end to end ─────────────────────────────── */

const newcomer = { email: qaEmail("signup"), userId: "", customerId: "" };

test("sign-up from a guest's Play: plan → account → refresh → Stripe test card → back to the movie, which plays", async ({ browser }) => {
  test.setTimeout(240_000);
  const { page, ctx, net } = await newPage(browser);
  await page.goto(`/movies/${seed.movie.slug}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /^(Play|Resume)$/ }).first().click();
  await page.getByTestId("signin-prompt").getByRole("link", { name: "Join StreamVerse" }).click();
  await expect(page).toHaveURL(/\/signup\/plan/);
  await page.getByRole("button", { name: /Standard/ }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\/account/);
  await page.getByLabel("Full name").fill("QA Signup");
  await page.getByLabel("Email", { exact: false }).first().fill(newcomer.email);
  await page.locator("#su-password").fill(PASSWORD);
  await page.locator("#su-confirm").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\/payment/, { timeout: 30_000 });
  // the account exists, but nothing is paid: no access yet
  const user = await db().user.findUnique({ where: { email: newcomer.email } });
  newcomer.userId = user["id"];
  const before = await db().subscription.findUnique({ where: { userId: newcomer.userId } });
  expect(before?.["status"] ?? "NONE").not.toBe("ACTIVE");

  // a refresh in the middle of paying keeps the customer on the payment step
  await page.reload();
  await expect(page.getByTestId("stripe-pay-form")).toBeVisible({ timeout: 30_000 });
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(page).toHaveURL(/\/signup\/complete/, { timeout: 90_000 });
  await expect(page.getByText("Your membership is now active")).toBeVisible();

  // MySQL and Stripe agree: one real Stripe subscription, ACTIVE, on Standard, and one paid invoice
  const sub = await db().subscription.findUnique({ where: { userId: newcomer.userId }, include: { plan: true } });
  expect(sub["status"]).toBe("ACTIVE");
  expect(sub["plan"]["slug"]).toBe("standard");
  expect(String(sub["stripeSubscriptionId"])).toMatch(/^sub_(?!localtest)/);
  newcomer.customerId = String(sub["stripeCustomerId"]);
  expect((await stripe("GET", `/subscriptions/${sub["stripeSubscriptionId"]}`))["status"]).toBe("active");
  await expect.poll(() => db().payment.count({ where: { userId: newcomer.userId, status: "SUCCEEDED" } }), { timeout: 30_000 }).toBe(1);

  // back to where they wanted to go: the movie, which plays
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(`/watch/${seed.movie.slug}$`));
  const video = page.locator("video").first();
  await expect(video).toBeVisible({ timeout: 30_000 });
  // the browser may hold back autoplay: press Play like a viewer would (as movie.r2.live.spec.ts does)
  const play = page.getByRole("button", { name: "Play", exact: true });
  if (await play.isVisible().catch(() => false)) await play.click();
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 60_000 }).toBeGreaterThan(2);
  await page.waitForTimeout(12_000); // long enough for the player to save progress
  await page.goto(`/movies/${seed.movie.slug}`);
  await expect.poll(() => db().movieProgress.count({ where: { userId: newcomer.userId, movieId: seed.movie.id } }), { timeout: 30_000 }).toBe(1);
  clean(net, "sign-up");
  await ctx.close();
});

test("the success page alone activates nothing: an unpaid account stays without a plan", async ({ browser }) => {
  const unpaid = await register("unpaid");
  const { page, ctx } = await newPage(browser);
  await signIn(page, unpaid.email);
  for (const p of ["/signup/complete", "/signup/complete?popup=1", "/billing/success"]) {
    await page.goto(p);
    await page.waitForTimeout(3000);
    await expect(page.getByText("Your membership is now active"), `${p} must not claim success`).toHaveCount(0);
  }
  expect((await unpaid.api.get<Json>("/me/subscription")).data["status"]).not.toBe("ACTIVE");
  expect((await db().subscription.findUnique({ where: { userId: unpaid.userId } }))?.["status"] ?? "NONE").not.toBe("ACTIVE");
  expect((await consume(unpaid.api, "movie", seed.movie.id)).ok).toBe(false);
  await ctx.close();
});

test("abandoned payment: leaving the payment step creates no access; a declined card shows Stripe's message", async ({ browser }) => {
  test.setTimeout(150_000);
  const leaver = await register("abandon");
  const { page, ctx } = await newPage(browser);
  await signIn(page, leaver.email);
  await page.evaluate(() => sessionStorage.setItem("sv-signup-plan", "Basic"));
  await page.goto("/signup/payment");
  await expect(page.getByTestId("stripe-pay-form")).toBeVisible({ timeout: 30_000 });
  await fillCard(page, "4000000000000002");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(page.getByText(/declined/i).first()).toBeVisible({ timeout: 30_000 });
  await page.goto("/movies"); // walks away
  expect((await leaver.api.post<Json>("/me/subscription/sync")).data["status"] ?? "NONE").not.toBe("ACTIVE");
  expect((await consume(leaver.api, "movie", seed.movie.id)).ok).toBe(false);
  expect(await db().payment.count({ where: { userId: leaver.userId, status: "SUCCEEDED" } })).toBe(0);
  await ctx.close();
});

test("Stripe webhooks: the same event twice, and an old event arriving late, change nothing", async () => {
  test.skip(!newcomer.customerId, "needs the sign-up test's customer");
  const events = ((await stripe("GET", "/events", { limit: "100" }))["data"] as Json[]).filter((e) => e["data"]["object"]["customer"] === newcomer.customerId);
  const pick = events.filter((e) => ["invoice.paid", "invoice.payment_succeeded", "customer.subscription.created", "customer.subscription.updated", "checkout.session.completed"].includes(e["type"]));
  expect(pick.length, "Stripe has events for this customer").toBeGreaterThan(0);
  const counts = async () => ({
    subs: await db().subscription.count({ where: { userId: newcomer.userId } }),
    payments: await db().payment.count({ where: { userId: newcomer.userId } }),
    status: (await db().subscription.findUnique({ where: { userId: newcomer.userId } }))["status"],
  });
  // oldest first, then everything again: the second round is pure duplicates, the old "created" event arrives after "active"
  const ordered = [...pick].sort((a, b) => a["created"] - b["created"]);
  for (const e of ordered) expect(await deliverWebhook(e), `${e["type"]} first delivery`).toBe(200);
  const afterFirst = await counts();
  for (const e of ordered) expect(await deliverWebhook(e), `${e["type"]} duplicate`).toBe(200);
  const afterDuplicate = await counts();
  expect(afterDuplicate).toEqual(afterFirst);
  expect(afterDuplicate).toEqual({ subs: 1, payments: 1, status: "ACTIVE" });
  for (const e of ordered) expect(await db().stripeEvent.count({ where: { stripeEventId: e["id"] } }), `${e["id"]} stored once`).toBe(1);
  // a forged signature is refused
  const forged = await fetch(`${API}/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef" }, body: JSON.stringify(ordered[0]) });
  expect(forged.status).toBe(400);
});

test("returning customer: sign out, sign in again: same account, plan, progress, history; refreshes never flash Sign in", async ({ browser }) => {
  test.skip(!newcomer.userId, "needs the sign-up test's customer");
  const { page, ctx, net } = await newPage(browser);
  await signIn(page, newcomer.email);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  // signed out at once (Sign out lands on the Sign in page, which has its own slim header)
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY)).toBeNull();
  await signIn(page, newcomer.email);
  await page.goto("/subscription");
  await expect(page.getByText("Standard").first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/history");
  await expect(page.getByText(seed.movie.title).first()).toBeVisible({ timeout: 20_000 });
  // Continue Watching: the seeded movie is 4 s long, so how far the earlier playback got varies; save a half-way position the
  // way the player does (the real progress API), then the homepage row must show it — and finishing it must take it out
  const me = new Api(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY) as string);
  await me.put(`/me/progress/movie/${seed.movie.id}`, { positionSeconds: 2, durationSeconds: 4 });
  await page.goto("/");
  const row = page.locator("section", { has: page.getByRole("heading", { name: /Continue Watching/i }) });
  await expect(row, "Continue Watching row").toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(seed.movie.title).first()).toBeVisible();
  await page.goto(`/movies/${seed.movie.slug}`);
  await expect(page.getByRole("link", { name: "Resume" })).toBeVisible({ timeout: 20_000 });
  await me.put(`/me/progress/movie/${seed.movie.id}`, { positionSeconds: 4, durationSeconds: 4 });
  const cont = (await me.get<Json>("/me/continue")).data;
  expect(JSON.stringify(cont["movies"]), "a finished movie leaves Continue Watching").not.toContain(seed.movie.id);
  expect(JSON.stringify((await me.get<Json>("/me/history")).data), "...but stays in History").toContain(seed.movie.id);
  for (const p of ["/", "/movies", `/movies/${seed.movie.slug}`, "/my-list", "/subscription"]) {
    await page.goto(p);
    await page.reload();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expect(page.getByTestId("auth-guest")).toHaveCount(0);
  }
  const progress = (await new Api(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY) as string).get<Json>(`/me/progress/movie/${seed.movie.id}`)).data;
  expect(Number(progress["positionSeconds"])).toBeGreaterThan(0);
  clean(net, "returning customer");
  await ctx.close();
});

/* ─────────────────────────────── account pages ─────────────────────────────── */

test("notifications: empty state, unread, mark one read, mark all read, refresh — stored in MySQL, no crash", async ({ browser }) => {
  const nosub = accounts["nosub"]!;
  const { page, ctx, net } = await newPage(browser);
  await signIn(page, nosub.email);
  await page.goto("/notifications");
  await expect(page.getByText("No notifications")).toBeVisible({ timeout: 20_000 });
  await db().notification.createMany({
    data: [
      { userId: nosub.userId, type: "NEW_RELEASE", title: "QA new release", message: "A QA title arrived." },
      { userId: nosub.userId, type: "SYSTEM", title: "QA announcement", message: "Planned maintenance." },
      { userId: nosub.userId, type: "ACCOUNT", title: "QA already read", message: "Old news.", readAt: new Date() },
    ],
  });
  await page.reload();
  await expect(page.getByText("QA new release")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("2 unread")).toBeVisible();
  await expect(page.getByText("QA already read")).toBeVisible();
  await page.getByRole("button", { name: "Mark as read" }).first().click();
  await expect(page.getByText("1 unread")).toBeVisible();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You're all caught up")).toBeVisible({ timeout: 20_000 });
  expect(await db().notification.count({ where: { userId: nosub.userId, readAt: null } })).toBe(0);
  expect(net.pageErrors).toEqual([]);
  clean(net, "notifications");
  await ctx.close();
});

test("profile: name and playback preferences are saved to MySQL and come back after a refresh and in a new browser", async ({ browser }) => {
  const nosub = accounts["nosub"]!;
  const { page, ctx, net } = await newPage(browser);
  await signIn(page, nosub.email);
  await page.goto("/profile");
  await page.getByLabel("Full name").fill("QA Renamed");
  await page.getByLabel("Video quality").selectOption("1080p");
  await page.getByLabel("Audiobook speed").selectOption("1.5");
  await page.getByRole("button", { name: "Save Changes" }).first().click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect.poll(async () => (await db().user.findUnique({ where: { id: nosub.userId } }))["fullName"]).toBe("QA Renamed");
  const row = await db().user.findUnique({ where: { id: nosub.userId } });
  expect([row["videoQuality"], Number(row["audiobookSpeed"])]).toEqual(["1080p", 1.5]);
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("QA Renamed");
  await ctx.close();
  const fresh = await newPage(browser);
  await signIn(fresh.page, nosub.email);
  await fresh.page.goto("/profile");
  await expect(fresh.page.getByLabel("Full name")).toHaveValue("QA Renamed");
  await expect(fresh.page.getByLabel("Video quality")).toHaveValue("1080p");
  await expect(fresh.page.getByLabel("Audiobook speed")).toHaveValue("1.5");
  clean(net, "profile");
  clean(fresh.net, "profile (new browser)");
  await fresh.ctx.close();
});

test("payment methods: add two Stripe test cards, change the default, remove one, refresh — no card data in MySQL", async ({ browser }) => {
  test.setTimeout(180_000);
  test.skip(!newcomer.userId, "needs the sign-up test's customer");
  const { page, ctx, net } = await newPage(browser);
  await signIn(page, newcomer.email);
  await page.goto("/payment-methods");
  await expect(page.getByLabel("Saved payment methods")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("add-card").first().click();
  await expect(page.getByTestId("stripe-setup-form")).toBeVisible({ timeout: 30_000 });
  await fillCard(page, "5555555555554444");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText(/mastercard ending in 4444/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Set as default: mastercard/i }).click();
  await expect(page.getByText(/is now your default/)).toBeVisible({ timeout: 20_000 });
  await page.reload();
  const cards = page.getByLabel("Saved payment methods").locator("li");
  await expect(cards).toHaveCount(2, { timeout: 20_000 });
  await expect(cards.filter({ hasText: /4444/ }).getByText("Default")).toBeVisible();
  await page.getByRole("button", { name: /Remove visa/i }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(cards).toHaveCount(1, { timeout: 20_000 });
  await page.reload();
  await expect(page.getByLabel("Saved payment methods").locator("li")).toHaveCount(1, { timeout: 20_000 });
  // Stripe holds the cards; StreamVerse's database has no card number or CVC anywhere
  const columns = (await db().$queryRawUnsafe("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND (COLUMN_NAME LIKE '%card%' OR COLUMN_NAME LIKE '%cvc%' OR COLUMN_NAME LIKE '%cvv%' OR COLUMN_NAME LIKE '%pan%')")) as Json[];
  expect(columns.filter((c) => /number|cvc|cvv|^pan$/i.test(String(c["COLUMN_NAME"])))).toEqual([]);
  // payment history shows the sign-up invoice from Stripe
  const payments = (await new Api(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY) as string).get<Json[]>("/me/payments")).data;
  expect(payments.length).toBe(1);
  expect(Number(payments[0]!["amount"])).toBe(Number(planBy("standard")["priceAmount"] ?? planBy("standard")["price"]));
  clean(net, "payment methods");
  await ctx.close();
});

test("user isolation: customer B sees none of customer A's progress, history, list, notifications, payments, devices or plan", async () => {
  test.skip(!newcomer.userId, "needs the sign-up test's customer");
  const a = new Api((await new Api().post<Json>("/auth/login", { email: newcomer.email, password: PASSWORD })).data["accessToken"]);
  const b = accounts["nosub"]!.api;
  await a.post("/me/my-list", { contentId: seed.ebookEpub.id, contentType: "ebook" }).catch(() => undefined);
  await a.post("/me/devices/register", { deviceIdentifier: `qa-a-dev-${RUN}`, deviceName: "A's laptop" });
  const aIds = [newcomer.userId, newcomer.email, newcomer.customerId, seed.movie.id, `qa-a-dev-${RUN}`, "A's laptop"];
  for (const p of ["/me/continue", "/me/history", "/me/my-list", "/me/library", "/me/notifications", "/me/payments", "/me/devices", "/me/subscription", "/me/payment-methods", `/me/progress/movie/${seed.movie.id}`, "/me/profile"]) {
    const res = await b.raw("GET", p);
    const text = await res.text();
    for (const id of aIds) expect(text.includes(id), `B's ${p} must not contain A's ${id}`).toBe(false);
  }
  expect((await b.get<Json>("/me/subscription")).data["status"]).toBeNull();
});

/* ─────────────────────────────── admin changes reach customers ─────────────────────────────── */

test("search and suggestions find admin-created titles from the real backend", async ({ page }) => {
  const net = track(page);
  const s = await new Api().get<Json>(`/search/suggestions?q=${encodeURIComponent("E2E Live")}`);
  expect(JSON.stringify(s.data)).toContain(seed.movie.title);
  await page.goto(`/search?q=${encodeURIComponent("E2E Live")}`);
  for (const t of [seed.movie.title, seed.ebookEpub.title, seed.audiobook.title]) await expect(page.getByText(t).first()).toBeVisible({ timeout: 20_000 });
  await page.goto(`/search?q=${encodeURIComponent("zzqx-no-such-title")}`);
  await expect(page.getByText(/no results|nothing found|no matches/i).first()).toBeVisible({ timeout: 20_000 });
  clean(net, "search");
});

test("a collection created, renamed and deleted by the admin reaches the customer page at once", async ({ page }) => {
  const created = await admin.post<Json>("/admin/collections", { name: "QA Collection", manualSlug: `qa-collection-${RUN}`, description: "QA" });
  const id = String(created.data["id"]);
  const slug = String(created.data["slug"]);
  restore.push(() => admin.del(`/admin/collections/${id}`).catch(() => undefined));
  await admin.post(`/admin/collections/${id}/items`, { contentId: seed.movie.id, displayOrder: 0 });
  await admin.put(`/admin/collections/${id}`, { status: "PUBLISHED" });
  await page.goto(`/collections/${slug}`);
  await expect(page.getByRole("heading", { name: "QA Collection" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(seed.movie.title).first()).toBeVisible();
  await admin.put(`/admin/collections/${id}`, { name: "QA Collection Renamed" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "QA Collection Renamed" })).toBeVisible({ timeout: 20_000 });
  await admin.del(`/admin/collections/${id}`);
  expect((await new Api().raw("GET", `/collections/${slug}`)).status).toBe(404);
  await page.reload();
  await expect(page.getByText(/not found|isn't available|doesn't exist/i).first()).toBeVisible({ timeout: 20_000 });
});

/* ─────────────────────────────── mobile ─────────────────────────────── */

test("mobile: guest pages fit the screen, the Play prompt works, sign-in shows the account menu", async ({ browser }) => {
  const { page, ctx, net } = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fits = async (label: string) => {
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw, `${label}: no sideways scrolling`).toBeLessThanOrEqual(iw + 1);
  };
  for (const p of ["/", `/movies/${seed.movie.slug}`, `/ebooks/${seed.ebookEpub.slug}`, `/audiobooks/${seed.audiobook.slug}`, "/search?q=E2E", "/sign-in", "/signup/plan"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    await fits(p);
  }
  await page.goto(`/movies/${seed.movie.slug}`);
  await page.getByRole("link", { name: /^(Play|Resume)$/ }).first().click();
  await expect(page.getByTestId("signin-prompt")).toBeVisible();
  await fits("play prompt");
  await page.getByTestId("signin-prompt").getByRole("button", { name: "Continue browsing" }).click();
  await signIn(page, accounts["nosub"]!.email);
  await fits("signed in");
  clean(net, "mobile");
  await ctx.close();
});
