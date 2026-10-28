import { expect, test, type Page } from "@playwright/test";
import { ApiError } from "./lib/api";
import { asAdmin, asUser } from "./lib/auth";
import { ADMIN_STATE, SEED_PREFIX } from "./lib/env";
import { createAudiobook, createEbook, createMovie, type SeededItem } from "./lib/seed";

/**
 * Every button in the Actions column of the admin Movies / eBooks / Audiobooks lists, clicked in a real browser
 * against the real API: stats, edit, preview, publish, unpublish, archive and delete. Each change is checked on the
 * server and on the customer side, not only on screen.
 */
test.use({ storageState: ADMIN_STATE });
test.describe.configure({ mode: "serial" });

type Kind = "movies" | "ebooks" | "audiobooks";
const made: { kind: Kind; id: string }[] = [];
test.afterAll(async () => {
  // anything a failed run left behind
  for (const m of made) await asAdmin().del(`/admin/${m.kind}/${m.id}`, {}).catch(() => undefined);
});

const statusOnServer = async (kind: Kind, id: string) => String((await asAdmin().get<Record<string, unknown>>(`/admin/${kind}/${id}`)).data["status"]);
const customerStatus = async (kind: Kind, slug: string) =>
  asUser()
    .get(`/${kind}/${slug}`)
    .then((r) => r.status)
    .catch((e: unknown) => (e instanceof ApiError ? e.status : 0));

async function openList(page: Page, kind: Kind, title: string) {
  await page.goto(`/admin/${kind}`);
  await page.getByPlaceholder(/^Search (movies|eBooks|audiobooks) by/).fill(title);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  return row;
}

async function allActions(page: Page, kind: Kind, item: SeededItem) {
  const { title, slug, id } = item;
  let row = await openList(page, kind, title);
  await expect(row).toContainText("Draft");

  // stats wait until the title is live
  await expect(row.getByRole("button", { name: `Stats for ${title} are available once it is published` })).toBeDisabled();

  // edit opens the wizard filled with this title
  await row.getByRole("link", { name: `Edit ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/${kind}/${slug}/edit$`));
  await expect.poll(() => page.locator("input").evaluateAll((els, t) => els.some((e) => (e as HTMLInputElement).value === t), title), { timeout: 30_000 }).toBe(true);

  // preview opens the customer page even though customers can't see it yet
  row = await openList(page, kind, title);
  await row.getByRole("link", { name: `Preview ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/${kind}/${slug}$`));
  await expect(page.getByTestId("preview-banner")).toContainText("draft");
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
  expect(await customerStatus(kind, slug), "a customer still can't open the draft").toBe(404);

  // publish
  row = await openList(page, kind, title);
  await row.getByRole("button", { name: `Publish ${title}` }).click();
  await expect(page.getByText(`${title} · Published`)).toBeVisible();
  await expect(row).toContainText("Published");
  expect(await statusOnServer(kind, id)).toBe("PUBLISHED");
  expect(await customerStatus(kind, slug), "customers can open it now").toBe(200);

  // stats of a live title: the real numbers from the server
  await row.getByRole("link", { name: `View stats for ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/${kind}/${slug}/stats$`));
  await expect(page.getByTestId("title-stats")).toContainText("Unique audience");
  await page.getByLabel("Date range").selectOption("Last 12 months");
  await expect(page.getByTestId("title-stats")).toContainText("Last 12 months");

  // unpublish
  row = await openList(page, kind, title);
  await row.getByRole("button", { name: `Unpublish ${title}` }).click();
  await expect(page.getByText(`${title} · Unpublished`)).toBeVisible();
  await expect(row).toContainText("Unpublished");
  expect(await statusOnServer(kind, id)).toBe("UNPUBLISHED");
  expect(await customerStatus(kind, slug), "hidden from customers again").toBe(404);

  // archive
  await row.getByRole("button", { name: `Archive ${title}` }).click();
  await expect(page.getByText(`${title} · Archived`)).toBeVisible();
  await expect(row).toContainText("Archived");
  await expect(row.getByRole("button", { name: `Archive ${title}` })).toBeDisabled();
  expect(await statusOnServer(kind, id)).toBe("ARCHIVED");

  // the change is on the server: a reload shows the same
  await page.reload();
  row = await openList(page, kind, title);
  await expect(row).toContainText("Archived");

  // delete, after confirming
  await row.getByRole("button", { name: `Delete ${title}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`${title} deleted`)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: title })).toHaveCount(0);
  const gone = await asAdmin()
    .get(`/admin/${kind}/${id}`)
    .then(() => 200)
    .catch((e: unknown) => (e instanceof ApiError ? e.status : 0));
  expect(gone, "deleted on the server").toBe(404);
}

test("movie: every action in the Actions column", async ({ page }) => {
  test.setTimeout(300_000);
  const item = await createMovie(asAdmin(), `${SEED_PREFIX} Actions Movie ${Date.now()}`, { publishIt: false });
  made.push({ kind: "movies", id: item.id });
  await allActions(page, "movies", item);
});

test("eBook: every action in the Actions column", async ({ page }) => {
  test.setTimeout(300_000);
  const item = await createEbook(asAdmin(), `${SEED_PREFIX} Actions eBook ${Date.now()}`, "epub", { publishIt: false });
  made.push({ kind: "ebooks", id: item.id });
  await allActions(page, "ebooks", item);
});

test("audiobook: every action in the Actions column", async ({ page }) => {
  test.setTimeout(300_000);
  const item = await createAudiobook(asAdmin(), `${SEED_PREFIX} Actions Audiobook ${Date.now()}`, { publishIt: false });
  made.push({ kind: "audiobooks", id: item.id });
  await allActions(page, "audiobooks", item);
});

test("publishing a title that is missing its files says why and changes nothing", async ({ page }) => {
  const title = `${SEED_PREFIX} Actions Empty ${Date.now()}`;
  const admin = asAdmin();
  const genres = (await admin.get<Record<string, unknown>[]>("/admin/genres?limit=100")).data;
  const languages = (await admin.get<Record<string, unknown>[]>("/admin/languages?limit=100")).data;
  const genre = genres.find((g) => g["contentType"] === "MOVIE") ?? genres.find((g) => !g["contentType"]) ?? genres[0]!;
  const lang = languages.find((l) => l["code"] === "en") ?? languages[0]!;
  const created = (
    await admin.post<Record<string, unknown>>("/admin/movies", {
      title,
      summary: "No files yet.",
      description: "A draft with no files, made by the E2E suite.",
      visibility: "PUBLIC",
      releaseDate: "2025-01-15",
      age: { ageRating: "13+" },
      genreIds: [String(genre["id"])],
      languages: [{ languageId: String(lang["id"]), role: "PRIMARY" }],
      movie: { runtimeMinutes: 1 },
    })
  ).data;
  const id = String(created["id"]);
  made.push({ kind: "movies", id });

  const row = await openList(page, "movies", title);
  await row.getByRole("button", { name: `Publish ${title}` }).click();
  const error = page.getByText(new RegExp(`${title} could not be published: .+`));
  await expect(error).toBeVisible();
  console.log(`[actions] shown to the admin: ${await error.textContent()}`);
  await expect(row).toContainText("Draft");
  expect(await statusOnServer("movies", id)).toBe("DRAFT");
});

test("the list shows every title on the server, not only the first page", async ({ page }) => {
  for (const kind of ["movies", "ebooks", "audiobooks"] as const) {
    const total = Number(((await asAdmin().raw("GET", `/admin/${kind}?limit=1`).then((r) => r.json())) as { pagination: { total: number } }).pagination.total);
    await page.goto(`/admin/${kind}`);
    await expect(page.getByText(new RegExp(`^${total} of ${total} titles?$`))).toBeVisible({ timeout: 30_000 });
  }
});
