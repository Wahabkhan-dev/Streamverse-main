import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { asAdmin } from "./lib/auth";
import { ADMIN_STATE, FIXTURES } from "./lib/env";
import { track } from "./lib/net";
import { imagesUploaded, movieToImages, pickLibraryImage } from "./lib/wizard";

/**
 * Runs in the live-r2-no-cors project: the browser PUTs the file straight to the R2 bucket, which needs bucket CORS
 * (BLOCKED EXTERNAL, see cors.live.spec.ts). Everything else - login, API, MySQL, R2 objects - is real.
 */
test.use({ storageState: ADMIN_STATE });

const admin = () => asAdmin();
const stamp = Date.now().toString(36);

type Json = Record<string, unknown>;
const stats = async () =>
  (
    await admin().get<{ total: number; storageBytes: number; unattached: number }>(
      "/admin/media/stats",
    )
  ).data;

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle").catch(() => undefined);
};

test("Media Library lists every existing asset, filters, searches, sorts, pages and keeps its state in the URL", async ({
  page,
}) => {
  const net = track(page);
  const before = await stats();
  expect(before.total, "the seeded library has files").toBeGreaterThan(10);

  await page.goto("/admin/dashboard");
  await page.getByRole("link", { name: "Media", exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/media/);
  await expect(page.getByRole("heading", { name: "Media Library" })).toBeVisible();

  await expect(page.getByTestId("stat-total")).toHaveText(String(before.total));
  await expect(page.getByTestId("media-item").first()).toBeVisible();
  // thumbnails for images are real signed R2 images; nothing in the grid is a <video> or <audio>
  expect(
    await page.locator("[data-testid=media-grid] video, [data-testid=media-grid] audio").count(),
  ).toBe(0);

  // pagination: 24 per page, server side
  const first = await admin().raw("GET", "/admin/media?limit=24");
  const firstBody = (await first.json()) as { pagination: { total: number; totalPages: number } };
  await expect(page.getByTestId("page-info")).toContainText(`${firstBody.pagination.total} file`);
  if (firstBody.pagination.totalPages > 1) {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
  }

  // type filter -> URL
  await page.goto("/admin/media");
  await page.getByTestId("type-videos").click();
  await expect(page).toHaveURL(/category=videos/);
  const videos = (await (
    await admin().raw("GET", "/admin/media?category=videos&limit=100")
  ).json()) as { pagination: { total: number } };
  await expect(page.getByTestId("media-item")).toHaveCount(videos.pagination.total);

  // content filter + role + status are server filters too
  await page.getByTestId("clear-filters").click();
  await page.getByTestId("filter-attached").selectOption("unattached");
  await expect(page).toHaveURL(/attached=unattached/);
  await expect(page.getByTestId("media-item")).toHaveCount(before.unattached);
  await page.getByTestId("clear-filters").click();

  // search by content title (resolved on the server through the title that uses the file)
  await page.getByTestId("media-search").fill("E2E Live Movie");
  await expect(page).toHaveURL(/q=E2E/);
  const bySearch = (await (
    await admin().raw("GET", "/admin/media?search=E2E%20Live%20Movie&limit=100")
  ).json()) as { pagination: { total: number } };
  expect(bySearch.pagination.total).toBeGreaterThan(0);
  await expect(page.getByTestId("media-item")).toHaveCount(bySearch.pagination.total);

  // list view + a reload keeps the whole view
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page).toHaveURL(/view=list/);
  await page.reload();
  await expect(page.getByTestId("media-list")).toBeVisible();
  await expect(page.getByTestId("media-search")).toHaveValue("E2E Live Movie");

  // sort
  await page.getByTestId("clear-filters").click();
  await page.getByTestId("sort").selectOption("size");
  await expect(page).toHaveURL(/sort=size/);

  // no page-level horizontal overflow at a phone width
  await page.setViewportSize({ width: 320, height: 800 });
  await settle(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  expect(net.bad(), "no 404/5xx").toEqual([]);
  expect(net.pageErrors).toEqual([]);
});

test("Used By is shown for an existing asset and deleting it is blocked", async ({ page }) => {
  const used = (await (
    await admin().raw("GET", "/admin/media?attachedType=movies&limit=1")
  ).json()) as { data: Array<{ id: string; usedBy: Array<{ title: string }> }> };
  const target = used.data[0]!;
  await page.goto(`/admin/media?asset=${target.id}`);
  const drawer = page.getByTestId("media-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("used-by")).toContainText(target.usedBy[0]!.title);
  await drawer.getByTestId("delete-open").click();
  await expect(page.getByRole("alertdialog")).toContainText("This file is in use");
  await page.getByRole("button", { name: "OK" }).click();
  // the API refuses too, with the list of users, and nothing was deleted
  const res = await admin().raw("DELETE", `/admin/media/${target.id}`);
  expect(res.status).toBe(409);
  const body = (await res.json()) as { code: string; errors: Array<{ message: string }> };
  expect(body.code).toBe("MEDIA_IN_USE");
  expect(JSON.stringify(body.errors)).toContain(target.usedBy[0]!.title);
  expect((await admin().raw("GET", `/admin/media/${target.id}`)).status).toBe(200);
});

test("MAIN FLOW: upload an image, pick it for a Movie without duplicating the file, see Used By, delete is blocked, replace works", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const net = track(page);
  const title = `E2E Media Flow ${stamp}`;
  const before = await stats();
  const sameName = async () =>
    (
      (await (await admin().raw("GET", "/admin/media?search=poster-2&limit=100")).json()) as {
        pagination: { total: number };
      }
    ).pagination.total;
  const namesBefore = await sameName();

  // 1. upload through the Media Library UI (direct to R2, verified by the backend)
  await page.goto("/admin/media");
  await page.getByTestId("upload-open").click();
  await page.getByTestId("media-file-input").setInputFiles(join(FIXTURES, "poster-2.jpg"));
  const row = page.getByTestId("upload-row").first();
  await expect(row).toHaveAttribute("data-stage", "ready", { timeout: 60_000 });
  await page.keyboard.press("Escape");

  const afterUpload = await stats();
  expect(afterUpload.total, "exactly one new library entry").toBe(before.total + 1);

  // 2. it appears in the library, unattached, with a real object in R2
  await page.getByTestId("media-search").fill("poster-2");
  const item = page.getByTestId("media-item").first();
  await expect(item).toBeVisible();
  const assetId = (await item.getAttribute("data-asset-id"))!;
  const detail = (await admin().get<Json>(`/admin/media/${assetId}`)).data;
  expect(detail["status"]).toBe("READY");
  expect(detail["type"]).toBe("LIBRARY_IMAGE");
  expect(String(detail["objectKey"])).toMatch(/^media\/images\/library\/[0-9a-f-]+\.jpg$/);
  expect((detail["usedBy"] as unknown[]).length).toBe(0);
  // the preview link is a signed GET (not HEAD): fetch it and compare the bytes with what the backend recorded
  const obj = await fetch(String(detail["previewUrl"]));
  expect(obj.status, "the object really exists in R2").toBe(200);
  expect((await obj.arrayBuffer()).byteLength).toBe(Number(detail["sizeBytes"]));

  // 3. create a Movie in the original wizard and choose that image from the library for its poster
  await movieToImages(page, title);
  await pickLibraryImage(page, "poster", "poster-2");
  await expect(page.getByTestId("library-poster")).toContainText("Choose another");
  await page.getByLabel("Backdrop image").setInputFiles(join(FIXTURES, "backdrop.jpg"));
  await page.getByLabel("Thumbnail image").setInputFiles(join(FIXTURES, "thumb.jpg"));
  await imagesUploaded(page, 3);
  await page.getByRole("button", { name: "Save as Draft" }).click();
  await expect(page).toHaveURL(/\/admin\/movies$/, { timeout: 60_000 });

  // 4. same R2 object, no copy: still one library entry, and the movie points at the same asset id
  const movie = await findMovie(title);
  expect((movie["movie"] as Json)["posterAssetId"]).toBe(assetId);
  expect(await sameName(), "choosing it for the movie did not create a second library entry").toBe(
    namesBefore + 1,
  );
  expect(
    (await stats()).total,
    "only the main video, backdrop and thumbnail uploaded in the wizard are new",
  ).toBe(afterUpload.total + 3);

  // 5. Admin Movies list shows the cover from that asset
  const listed = (await admin().get<Json[]>(`/admin/movies?search=${encodeURIComponent(title)}`))
    .data[0]!;
  expect(JSON.stringify(listed)).toContain("http");

  // 6. Media now says Used By: that movie; delete is blocked
  await page.goto(`/admin/media?asset=${assetId}`);
  await expect(page.getByTestId("used-by")).toContainText(title);
  await page.getByTestId("delete-open").click();
  await expect(page.getByRole("alertdialog")).toContainText("This file is in use");
  await page.getByRole("button", { name: "OK" }).click();
  expect((await admin().raw("DELETE", `/admin/media/${assetId}`)).status).toBe(409);

  // 7. replace it with a different picture: every reference moves, nothing is deleted first
  await page.getByTestId("replace-open").click();
  await page.getByTestId("media-file-input").last().setInputFiles(join(FIXTURES, "poster.jpg"));
  await expect(page.getByTestId("media-drawer")).toBeHidden({ timeout: 60_000 });
  const moved = await findMovie(title);
  const newId = String((moved["movie"] as Json)["posterAssetId"]);
  expect(newId).not.toBe(assetId);
  const newDetail = (await admin().get<Json>(`/admin/media/${newId}`)).data;
  expect((newDetail["usedBy"] as Array<{ title: string }>)[0]!.title).toBe(title);
  expect(net.bad(), "no 404/5xx in the whole flow").toEqual([]);

  // 8. cleanup: delete the movie (a deleted title no longer protects its files), then the two files
  const extra = ["backdropAssetId", "thumbnailAssetId", "masterAssetId"].map((f) =>
    String((moved["movie"] as Json)[f]),
  );
  await admin().del(`/admin/movies/${String(moved["id"])}`, {});
  for (const id of extra)
    expect((await admin().raw("DELETE", `/admin/media/${id}`)).status).toBe(200);
  expect((await admin().raw("DELETE", `/admin/media/${newId}`)).status).toBe(200);
  const oldRow = await admin().raw("GET", `/admin/media/${assetId}`);
  if (oldRow.status === 200)
    expect((await admin().raw("DELETE", `/admin/media/${assetId}`)).status).toBe(200);
  expect((await stats()).total, "library is back to where it started").toBe(before.total);
});

async function findMovie(title: string): Promise<Json> {
  const rows = (await admin().get<Json[]>(`/admin/movies?search=${encodeURIComponent(title)}`))
    .data;
  const hit = rows.find((r) => r["title"] === title);
  if (!hit) throw new Error(`movie "${title}" was not created`);
  return (await admin().get<Json>(`/admin/movies/${String(hit["id"])}`)).data;
}
