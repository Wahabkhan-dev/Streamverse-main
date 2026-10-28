import { expect, test } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { asAdmin } from "./lib/auth";
import { ADMIN_STATE, FIXTURES, USER_STATE } from "./lib/env";
import { track } from "./lib/net";

/**
 * Homepage loading (shell first, two priority sections, the rest lazily) and the Banner -> Homepage section flow, in a real
 * browser against the real API, MySQL and R2. Runs in the no-CORS project because the banner picture is uploaded from the
 * browser-side helper straight to the R2 bucket (bucket CORS is BLOCKED EXTERNAL; see cors.live.spec.ts).
 */
const admin = () => asAdmin();
const stamp = Date.now().toString(36);

test("the homepage paints its shell at once, loads the first two sections with priority and the rest after", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ storageState: USER_STATE });
  const page = await ctx.newPage();
  const net = track(page);
  const homepageCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/homepage")) homepageCalls.push(new URL(r.url()).search);
  });
  // hold the first slice for a moment, so the empty state of the page is observable
  await page.route("**/api/v1/homepage?offset=0*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.goto("/");
  // shell: header and footer exist, and skeletons (not a blank page) stand in for the content, before any section has arrived
  await expect(page.getByRole("link", { name: "Movies", exact: true }).first()).toBeVisible();
  await expect(page.locator("[aria-busy=true]")).toBeVisible();
  await expect(page.locator("footer")).toBeAttached();

  await expect(page.locator("[aria-busy=true]")).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => homepageCalls.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  expect(homepageCalls[0], "first request is the two priority sections").toContain(
    "offset=0&limit=2",
  );
  expect(homepageCalls[1], "the rest is a separate, later request").toContain("offset=2");
  expect(homepageCalls.length, "each slice is requested exactly once").toBe(2);
  // the page does not re-download whole catalogs to build itself
  expect(net.calls.filter((c) => /^\/(movies|ebooks|audiobooks)$/.test(c.path)).length).toBe(0);
  expect(net.bad()).toEqual([]);
  await ctx.close();
});

test("a Banner is created once, then placed on the homepage by a section, and its position is just the section order", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const title = `E2E Placement Banner ${stamp}`;
  const sectionKey = `e2e_banner_${stamp.replace(/[^a-z0-9]/g, "")}`;

  // 1. a wide library picture and a banner that uses it (no homepage section yet)
  const path = join(FIXTURES, "backdrop.jpg");
  const p = (
    await admin().post<{ assetId: string; uploadUrl: string; headers: Record<string, string> }>(
      "/admin/uploads/presign",
      {
        library: true,
        purpose: "LIBRARY_IMAGE",
        fileName: `${stamp}-banner.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: statSync(path).size,
      },
    )
  ).data;
  await fetch(p.uploadUrl, { method: "PUT", headers: p.headers, body: readFileSync(path) });
  await admin().post(`/admin/uploads/${p.assetId}/complete`);
  const banner = (
    await admin().post<{ id: string }>("/admin/banners", {
      type: "NORMAL",
      title,
      description: "Placed by a section",
      buttonText: "Open",
      desktopAssetId: p.assetId,
      active: true,
    })
  ).data;

  const customerKeys = async () =>
    (
      (await (
        await fetch(`${process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1"}/homepage`)
      ).json()) as { data: Array<{ key: string }> }
    ).data.map((s) => s.key);
  expect(
    await customerKeys(),
    "creating a banner alone puts nothing on the homepage",
  ).not.toContain(sectionKey);

  let sectionId: string | undefined;
  try {
    // 2. Admin -> Homepage -> Add Section -> Banner -> pick it -> create
    const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminCtx.newPage();
    await adminPage.goto("/admin/homepage");
    await adminPage.getByRole("button", { name: /Add Section/i }).click();
    await adminPage.getByPlaceholder("e.g. my_custom_section").fill(sectionKey);
    await adminPage.getByPlaceholder("e.g. My Custom Section").fill("Placed banner");
    await adminPage.getByLabel("Section source").selectOption("BANNER");
    await adminPage
      .getByTestId("section-banner")
      .selectOption({ label: new RegExp(title) as never })
      .catch(async () => {
        const opt = adminPage.getByTestId("section-banner").locator("option", { hasText: title });
        await adminPage
          .getByTestId("section-banner")
          .selectOption((await opt.getAttribute("value")) as string);
      });
    await adminPage.getByRole("button", { name: /Create Section/i }).click();
    await expect(adminPage.getByText("Section created.")).toBeVisible();
    await adminCtx.close();

    // 3. customers see it, at the end (the order it was created in), with its own picture
    const keys = await customerKeys();
    expect(keys.at(-1)).toBe(sectionKey);
    const userCtx = await browser.newContext({ storageState: USER_STATE });
    const home = await userCtx.newPage();
    await home.goto("/");
    // it is the last section, so it is lazy: it only appears once the reader scrolls toward it
    await expect(home.getByText(title)).toHaveCount(0);
    await expect(async () => {
      await home.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(home.getByText(title)).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });

    // 4. moving it is only a different displayOrder (the Homepage screen's Save layout sends the whole order like this)
    const sections = (
      await admin().get<Array<{ id: string; key: string }>>("/admin/homepage/sections?limit=100")
    ).data;
    const mine = sections.find((s) => s.key === sectionKey)!;
    sectionId = mine.id;
    const reordered = sections.filter((s) => s.key !== sectionKey);
    reordered.splice(1, 0, mine);
    await admin().put(
      "/admin/homepage/sections/reorder",
      reordered.map((s, i) => ({ id: s.id, displayOrder: i })),
    );
    const moved = await customerKeys();
    expect(moved.indexOf(sectionKey), "now second").toBe(1);
    await home.reload();
    await expect(home.getByText(title)).toBeVisible({ timeout: 30_000 });
    // second section = loaded with priority, so it is on screen without any scrolling
    const box = await home.getByText(title).first().boundingBox();
    expect(box && box.y, "visible near the top, not pushed down to the lazy tail").toBeLessThan(
      1800,
    );
    await userCtx.close();
  } finally {
    // cleanup runs even when an assertion above fails: no stray sections, banners or pictures
    const found =
      sectionId ??
      (
        await admin().get<Array<{ id: string; key: string }>>("/admin/homepage/sections?limit=100")
      ).data.find((s) => s.key === sectionKey)?.id;
    if (found) await admin().del(`/admin/homepage/sections/${found}`, {});
    await admin().del(`/admin/banners/${banner.id}`, {});
    await admin().raw("DELETE", `/admin/media/${p.assetId}`);
  }
  expect(await customerKeys()).not.toContain(sectionKey);
});
