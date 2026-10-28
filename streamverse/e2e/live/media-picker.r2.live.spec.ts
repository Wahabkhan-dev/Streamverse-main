import { expect, test, type Page } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { asAdmin } from "./lib/auth";
import { ADMIN_STATE, FIXTURES } from "./lib/env";
import { track } from "./lib/net";
import { audiobookToImages, ebookToCovers, movieToImages, pickLibraryImage } from "./lib/wizard";

/**
 * The reusable Media Library picker in every place that takes a picture, plus the backend's type/size limits and the
 * storage-health screen. Runs in the live-r2-no-cors project like the rest of the media specs (R2 bucket CORS is
 * BLOCKED EXTERNAL; see cors.live.spec.ts).
 */
test.use({ storageState: ADMIN_STATE });

const admin = () => asAdmin();
const stamp = Date.now().toString(36);
type Json = Record<string, unknown>;
const stats = async () => (await admin().get<{ total: number }>("/admin/media/stats")).data;

/** A picture uploaded to the library the way the Upload dialog does it (presign -> R2 -> verify), without the UI. */
async function uploadLibraryImage(file: string): Promise<string> {
  const path = join(FIXTURES, file);
  const p = (
    await admin().post<{ assetId: string; uploadUrl: string; headers: Record<string, string> }>(
      "/admin/uploads/presign",
      {
        library: true,
        purpose: "LIBRARY_IMAGE",
        fileName: `${stamp}-${basename(file)}`,
        mimeType: "image/jpeg",
        sizeBytes: statSync(path).size,
      },
    )
  ).data;
  const put = await fetch(p.uploadUrl, {
    method: "PUT",
    headers: p.headers,
    body: readFileSync(path),
  });
  if (!put.ok) throw new Error(`R2 PUT failed ${put.status}`);
  await admin().post(`/admin/uploads/${p.assetId}/complete`);
  return p.assetId;
}

async function pickFromLibrary(page: Page, slotId: string, term: string) {
  await page.getByTestId(`select-${slotId}`).click();
  const picker = page.getByTestId("media-picker");
  await expect(picker).toBeVisible();
  await picker.getByLabel("Search images").fill(term);
  const item = picker.getByTestId("picker-item").first();
  await expect(item).toBeVisible();
  await item.click();
  await picker.getByTestId("picker-confirm").click();
  await expect(picker).toBeHidden();
}

async function findByTitle(kind: "ebooks" | "audiobooks", title: string): Promise<Json> {
  const rows = (await admin().get<Json[]>(`/admin/${kind}?search=${encodeURIComponent(title)}`))
    .data;
  const hit = rows.find((r) => r["title"] === title);
  if (!hit) throw new Error(`"${title}" was not created`);
  return (await admin().get<Json>(`/admin/${kind}/${String(hit["id"])}`)).data;
}

test("eBook, Audiobook, Banner and Collection each use a library image; the backend enforces type and size", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const net = track(page);
  const before = await stats();
  const ids = {
    ebook: await uploadLibraryImage("ebook-cover.jpg"),
    audiobook: await uploadLibraryImage("audiobook-cover.jpg"),
    wide: await uploadLibraryImage("backdrop.jpg"),
    tiny: await uploadLibraryImage("thumb.jpg"),
  };
  const made: Array<() => Promise<unknown>> = [];
  const extra: string[] = []; // files the wizards uploaded along the way
  const started = new Date().toISOString();

  try {
    // eBook: the original wizard, cover chosen from the Media Library
    await ebookToCovers(page, `E2E Wizard eBook ${stamp}`);
    await pickLibraryImage(page, "front", `${stamp}-ebook-cover`);
    await page.getByRole("button", { name: "Save as Draft" }).click();
    await expect(page).toHaveURL(/\/admin\/ebooks$/, { timeout: 60_000 });
    const ebook = await findByTitle("ebooks", `E2E Wizard eBook ${stamp}`);
    made.push(() => admin().del(`/admin/ebooks/${String(ebook["id"])}`, {}));
    expect((ebook["ebook"] as Json)["frontCoverAssetId"]).toBe(ids.ebook);
    extra.push(String((ebook["ebook"] as Json)["epubAssetId"]));

    // Audiobook: the original wizard, cover chosen from the Media Library
    await audiobookToImages(page, `E2E Wizard Audiobook ${stamp}`);
    await pickLibraryImage(page, "cover", `${stamp}-audiobook-cover`);
    await page.getByRole("button", { name: "Save as Draft" }).click();
    await expect(page).toHaveURL(/\/admin\/audiobooks$/, { timeout: 60_000 });
    const audiobook = await findByTitle("audiobooks", `E2E Wizard Audiobook ${stamp}`);
    made.push(() => admin().del(`/admin/audiobooks/${String(audiobook["id"])}`, {}));
    expect((audiobook["audiobook"] as Json)["coverAssetId"]).toBe(ids.audiobook);
    extra.push(String((audiobook["audiobook"] as Json)["mainAssetId"]));

    // Banner (a normal banner needs 1200x400; the 1280x720 backdrop fits)
    await page.goto("/admin/banners");
    await page.getByTestId("add-banner").click();
    await page.getByTestId("banner-title").fill(`E2E Media Banner ${stamp}`);
    await page.getByLabel("Banner type").selectOption("NORMAL");
    await pickFromLibrary(page, "bannerDesktop", `${stamp}-backdrop`);
    await page.getByTestId("save-banner").click();
    await expect(
      page.getByTestId("banner-row").filter({ hasText: `E2E Media Banner ${stamp}` }),
    ).toBeVisible();
    const banner = (await admin().get<Json[]>("/admin/banners?limit=100")).data.find(
      (b) => b["title"] === `E2E Media Banner ${stamp}`,
    )!;
    made.push(() => admin().del(`/admin/banners/${String(banner["id"])}`, {}));
    expect(banner["desktopAssetId"]).toBe(ids.wide);

    // Collection
    await page.goto("/admin/collections");
    await page.getByTestId("add-collection").click();
    await page.getByTestId("collection-name").fill(`E2E Media Collection ${stamp}`);
    await pickFromLibrary(page, "collectionImage", `${stamp}-backdrop`);
    await page.getByTestId("save-collection").click();
    await expect(
      page.getByTestId("collection-row").filter({ hasText: `E2E Media Collection ${stamp}` }),
    ).toBeVisible();
    const collection = (await admin().get<Json[]>("/admin/collections?limit=100")).data.find(
      (c) => c["name"] === `E2E Media Collection ${stamp}`,
    )!;
    made.push(async () => {
      await admin().put(`/admin/collections/${String(collection["id"])}`, { bannerAssetId: null });
      await admin().del(`/admin/collections/${String(collection["id"])}`, {});
    });
    expect(collection["bannerAssetId"]).toBe(ids.wide);

    // one stored picture, two users: the banner and the collection
    const wide = (await admin().get<Json>(`/admin/media/${ids.wide}`)).data;
    expect((wide["usedBy"] as unknown[]).length).toBe(2);

    // the picker greys out a picture that is too small, and the backend refuses it anyway
    await movieToImages(page, `E2E Wizard Reject ${stamp}`);
    await page.getByTestId("library-poster").click();
    await page.getByTestId("media-picker").getByLabel("Search images").fill(`${stamp}-thumb`);
    const tiny = page.getByTestId("media-picker").getByTestId("picker-item").first();
    await expect(tiny).toBeDisabled();
    await expect(tiny).toContainText("Too small");
    await page.keyboard.press("Escape");
    const draft = (
      await admin().post<Json>("/admin/movies", {
        title: `E2E Media Reject ${stamp}`,
        visibility: "PUBLIC",
      })
    ).data;
    made.push(() => admin().del(`/admin/movies/${String(draft["id"])}`, {}));
    const refused = await admin().raw("PATCH", `/admin/movies/${String(draft["id"])}`, {
      movie: { posterAssetId: ids.tiny },
    });
    expect(refused.status, "a 320x180 picture is refused for a 500x750 poster").toBe(400);
    const wrongKind = await admin().raw("PATCH", `/admin/movies/${String(draft["id"])}`, {
      movie: { masterAssetId: ids.wide },
    });
    expect(wrongKind.status, "a picture cannot be a movie file").toBe(400);

    expect(net.bad()).toEqual([]);
  } finally {
    for (const undo of made.reverse()) await undo().catch(() => undefined);
    // a wizard that was abandoned after uploading leaves its file in the library, unattached (by design); remove this run's
    const stray = (await (
      await admin().raw("GET", "/admin/media?attachedType=unattached&limit=50&sort=newest")
    ).json()) as { data: Array<{ id: string; createdAt: string }> };
    for (const x of stray.data.filter((r) => r.createdAt >= started)) extra.push(x.id);
    for (const id of [...Object.values(ids), ...extra])
      await admin()
        .raw("DELETE", `/admin/media/${id}`)
        .catch(() => undefined);
  }
  expect((await stats()).total, "library is back to where it started").toBe(before.total);
});

test("Storage health reports on storage and never changes anything", async ({ page }) => {
  const before = await stats();
  await page.goto("/admin/media");
  await page.getByTestId("health-open").click();
  await page.getByTestId("health-run").click();
  const report = page.getByTestId("health-report");
  await expect(report).toBeVisible({ timeout: 60_000 });
  await expect(report).toContainText("Files checked");
  expect((await stats()).total).toBe(before.total);
});
