import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { asAdmin, asUser } from "./lib/auth";
import { ADMIN_STATE, FIXTURES } from "./lib/env";
import { track } from "./lib/net";
import { chooseLanguage, imagesUploaded, next, ready } from "./lib/wizard";

/**
 * The original multi-step Add Movie / Add eBook / Add Audiobook wizards, driven in a real browser against the real API,
 * MySQL and R2. Runs in the no-CORS project because the browser PUTs files straight to the R2 bucket (bucket CORS is
 * BLOCKED EXTERNAL; see cors.live.spec.ts).
 */
test.use({ storageState: ADMIN_STATE });

const admin = () => asAdmin();
const stamp = Date.now().toString(36);
type Json = Record<string, unknown>;

/** The wizard's uploaded files stay in the Media Library (unattached) when a title is deleted; remove the test's own. */
async function dropAssets(ids: unknown[]) {
  for (const id of ids) if (id) await admin().raw("DELETE", `/admin/media/${String(id)}`);
}

async function byTitle(kind: string, title: string): Promise<Json> {
  const rows = (await admin().get<Json[]>(`/admin/${kind}?search=${encodeURIComponent(title)}`))
    .data;
  const hit = rows.find((r) => r["title"] === title);
  if (!hit) throw new Error(`"${title}" was not created`);
  return (await admin().get<Json>(`/admin/${kind}/${String(hit["id"])}`)).data;
}

test("MOVIE: the original stepper creates, uploads MP4 + trailer + artwork to R2, publishes, and plays", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const net = track(page);
  const title = `E2E Wizard Movie ${stamp}`;

  await page.goto("/admin/movies");
  await page.getByRole("link", { name: /Add new movie/i }).click();
  await expect(page).toHaveURL(/\/admin\/movies\/new/);
  await expect(
    page.getByRole("navigation", { name: "Publishing steps" }).getByRole("button"),
  ).toHaveCount(8);

  // step 1: metadata. Next is refused until the required fields are filled.
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.locator("#title").fill(title);
  await page.locator("#shortDesc").fill("A short description.");
  await page.locator("#fullDesc").fill("A longer synopsis for the wizard test.");
  await page.locator("#releaseDate").fill("2025-02-02");
  await page.locator("#runtime").fill("1");
  await page.locator("#genre").selectOption({ index: 1 });
  await next(page);

  // step 2, then Back keeps the data
  await chooseLanguage(page, "English");
  await next(page);
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.locator("#primaryLanguage")).toHaveValue("English");
  await next(page);

  // step 3: the main movie file (MP4) - real upload, verified, processed
  await page.getByLabel("Main Movie File file").setInputFiles(join(FIXTURES, "movie.mp4"));
  await ready(page, "Main Movie File");
  await next(page);
  // step 4: trailer (optional) - uploaded
  await page.getByLabel("Official Trailer file").setInputFiles(join(FIXTURES, "movie.mp4"));
  await ready(page, "Official Trailer");
  await next(page);
  // step 5: artwork (upload new)
  await page.getByLabel("Poster image").setInputFiles(join(FIXTURES, "poster.jpg"));
  await page.getByLabel("Backdrop image").setInputFiles(join(FIXTURES, "backdrop.jpg"));
  await page.getByLabel("Thumbnail image").setInputFiles(join(FIXTURES, "thumb.jpg"));
  await imagesUploaded(page, 3);
  await next(page);
  await next(page); // cast & crew (optional)
  await page.locator("#ageRating").selectOption({ index: 2 });
  await page.getByText("Public", { exact: true }).first().click(); // visibility: open to everyone (the test customer has no subscription)
  await next(page);

  await page.getByRole("button", { name: "Publish movie" }).click();
  await expect(page).toHaveURL(/\/admin\/movies$/, { timeout: 60_000 });

  // the real thing exists: MySQL row, attached assets, objects in R2
  const movie = await byTitle("movies", title);
  expect(movie["status"]).toBe("PUBLISHED");
  const m = movie["movie"] as Json;
  for (const f of [
    "posterAssetId",
    "backdropAssetId",
    "thumbnailAssetId",
    "masterAssetId",
    "trailerAssetId",
  ])
    expect(m[f], f).toBeTruthy();
  const master = (await admin().get<Json>(`/admin/media/${String(m["masterAssetId"])}`)).data;
  expect(master["status"]).toBe("READY");
  expect(master["type"]).toBe("MOVIE_MASTER");
  expect((await fetch(String(master["previewUrl"]))).status, "master exists in R2").toBe(200);
  const poster = (await admin().get<Json>(`/admin/media/${String(m["posterAssetId"])}`)).data;
  expect((await fetch(String(poster["previewUrl"]))).status, "poster exists in R2").toBe(200);

  // customer side: the published movie plays
  const playback = (
    await asUser().post<{ playback: { url: string } }>(
      `/media/movies/${String(movie["id"])}/playback`,
    )
  ).data;
  expect((await fetch(playback.playback.url)).status, "playlist is served").toBe(200);

  // edit reopens everything filled in
  await page.goto(`/admin/movies/${String(movie["slug"])}/edit`);
  await expect(page.locator("#title")).toHaveValue(title);
  await expect(page.getByRole("navigation", { name: "Publishing steps" })).toBeVisible();
  expect(net.bad()).toEqual([]);

  // cleanup
  await admin().del(`/admin/movies/${String(movie["id"])}`, {});
  await dropAssets(
    Object.entries(m)
      .filter(([k]) => k.endsWith("AssetId"))
      .map(([, v]) => v),
  );
});

test("EBOOK: the original stepper uploads cover + EPUB + PDF to R2, publishes, and the real reader opens it", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const net = track(page);
  const title = `E2E Wizard eBook ${stamp}`;
  await page.goto("/admin/ebooks");
  await page.getByRole("link", { name: /Add new ebook/i }).click();
  await expect(page).toHaveURL(/\/admin\/ebooks\/new/);
  await expect(
    page.getByRole("navigation", { name: "Publishing steps" }).getByRole("button"),
  ).toHaveCount(6);

  await page.locator("#title").fill(title);
  await page.locator("#author").fill("Wizard Author");
  await page.locator("#summary").fill("A short summary.");
  await page.locator("#fullDesc").fill("A fuller description of the book.");
  await page.locator("#genre").selectOption({ index: 1 });
  await next(page);
  await chooseLanguage(page, "English");
  await next(page);
  // files: required - skipping is refused with a clear message
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByRole("alert").first()).toContainText("EPUB or PDF");
  await page.getByLabel("EPUB file", { exact: true }).setInputFiles(join(FIXTURES, "book.epub"));
  await ready(page, "EPUB");
  await page.getByLabel("PDF file", { exact: true }).setInputFiles(join(FIXTURES, "book.pdf"));
  await ready(page, "PDF");
  await next(page);
  await page.getByLabel("Front Cover image").setInputFiles(join(FIXTURES, "ebook-cover-large.jpg"));
  await page.getByLabel("Thumbnail image").setInputFiles(join(FIXTURES, "ebook-thumb.jpg"));
  await imagesUploaded(page, 2);
  await next(page);
  await page.getByText("Public", { exact: true }).first().click();
  await next(page);
  await page
    .getByRole("button", { name: /^Publish/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/admin\/ebooks$/, { timeout: 60_000 });

  const book = await byTitle("ebooks", title);
  expect(book["status"]).toBe("PUBLISHED");
  const e = book["ebook"] as Json;
  for (const f of ["epubAssetId", "pdfAssetId", "frontCoverAssetId", "thumbnailAssetId"])
    expect(e[f], f).toBeTruthy();
  const epub = (await admin().get<Json>(`/admin/media/${String(e["epubAssetId"])}`)).data;
  expect(epub["type"]).toBe("EBOOK_EPUB");
  expect((await fetch(String(epub["previewUrl"]))).status, "EPUB exists in R2").toBe(200);
  const access = (
    await asUser().post<{ access: { allowed: boolean } }>(
      `/media/ebooks/${String(book["id"])}/access`,
    )
  ).data;
  expect(access.access.allowed).toBe(true);
  expect(net.bad()).toEqual([]);
  await admin().del(`/admin/ebooks/${String(book["id"])}`, {});
  await dropAssets(
    Object.entries(e)
      .filter(([k]) => k.endsWith("AssetId"))
      .map(([, v]) => v),
  );
});

test("AUDIOBOOK: the original stepper uploads cover + audio to R2, publishes, and the player gets real audio", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const net = track(page);
  const title = `E2E Wizard Audiobook ${stamp}`;
  await page.goto("/admin/audiobooks");
  await page.getByRole("link", { name: /Add new audiobook/i }).click();
  await expect(page).toHaveURL(/\/admin\/audiobooks\/new/);
  await expect(
    page.getByRole("navigation", { name: "Publishing steps" }).getByRole("button"),
  ).toHaveCount(7);

  await page.locator("#title").fill(title);
  await page.locator("#author").fill("Wizard Author");
  await page.locator("#summary").fill("A short summary.");
  await page.locator("#fullDesc").fill("A fuller description of the audiobook.");
  await page.locator("#genre").selectOption({ index: 1 });
  await next(page);
  await chooseLanguage(page, "English");
  await page.locator("#narrator").fill("Wizard Narrator");
  await next(page);
  await page
    .getByLabel("Primary Audiobook Master File file")
    .setInputFiles(join(FIXTURES, "audiobook.mp3"));
  await ready(page, "Primary Audiobook Master File");
  await next(page);
  await next(page); // chapters
  await page.getByLabel("Cover image").setInputFiles(join(FIXTURES, "audiobook-cover-large.jpg"));
  await page.getByLabel("Thumbnail image").setInputFiles(join(FIXTURES, "audiobook-thumb.jpg"));
  await imagesUploaded(page, 2);
  await next(page);
  await page.getByText("Public", { exact: true }).first().click();
  await next(page);
  await page
    .getByRole("button", { name: /^Publish/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/admin\/audiobooks$/, { timeout: 60_000 });

  const book = await byTitle("audiobooks", title);
  expect(book["status"]).toBe("PUBLISHED");
  const a = book["audiobook"] as Json;
  for (const f of ["mainAssetId", "coverAssetId", "thumbnailAssetId"]) expect(a[f], f).toBeTruthy();
  const audio = (await admin().get<Json>(`/admin/media/${String(a["mainAssetId"])}`)).data;
  expect(audio["status"]).toBe("READY");
  expect((await fetch(String(audio["previewUrl"]))).status, "audio exists in R2").toBe(200);
  const pb = (
    await asUser().post<{ playback: { url: string } | null }>(
      `/media/audiobooks/${String(book["id"])}/playback`,
    )
  ).data;
  expect(pb.playback?.url).toBeTruthy();
  expect(net.bad()).toEqual([]);
  await admin().del(`/admin/audiobooks/${String(book["id"])}`, {});
  await dropAssets(
    Object.entries(a)
      .filter(([k]) => k.endsWith("AssetId"))
      .map(([, v]) => v),
  );
});
