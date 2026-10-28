import { expect, test } from "@playwright/test";
import { asAdmin } from "./lib/auth";
import { ADMIN_STATE } from "./lib/env";

/**
 * Genres & categories are dynamic: an admin adds one on the Genres page and it is saved on the server, offered in the
 * wizard for the right kind of title, hidden from customers when switched off, and refused for deletion while in use.
 */
test.use({ storageState: ADMIN_STATE });

const API = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";
const publicNames = async () =>
  ((await (await fetch(`${API}/genres`)).json()) as { data: Array<{ name: string }> }).data.map((g) => g.name);

test("an admin adds, edits, hides and deletes a genre and the rest of the app follows", async ({ page }) => {
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const name = `E2E Genre ${stamp}`;
  const renamed = `${name} Renamed`;
  const admin = asAdmin();
  const cleanup = async () => {
    const all = (await admin.get<Array<{ id: string; name: string }>>("/admin/genres")).data;
    for (const g of all.filter((x) => x.name.startsWith(`E2E Genre ${stamp}`))) await admin.del(`/admin/genres/${g.id}`, {}).catch(() => undefined);
  };

  try {
    // 1. add it, for movies only
    await page.goto("/admin/genres");
    await page.getByTestId("add-genre").click();
    await page.getByTestId("genre-name").fill(name);
    await page.getByTestId("genre-kind").selectOption("MOVIE");
    await page.getByTestId("save-genre").click();
    await expect(page.getByText("Genre added")).toBeVisible();
    await expect(page.getByTestId("genre-row").filter({ hasText: name })).toContainText("0 titles");
    expect(await publicNames(), "customers and wizards read it from the server").toContain(name);

    // 2. the Movie wizard offers it, the eBook wizard does not (it applies to movies only)
    await page.goto("/admin/movies/new");
    await expect(page.locator("#genre option", { hasText: name })).toHaveCount(1, { timeout: 20_000 });
    await page.goto("/admin/ebooks/new");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("option", { hasText: name })).toHaveCount(0);

    // 3. rename it and switch it off: customers stop seeing it, the admin list still has it
    await page.goto("/admin/genres");
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByTestId("genre-name").fill(renamed);
    await page.getByRole("switch", { name: "Available to pick and to filter by" }).click();
    await page.getByTestId("save-genre").click();
    await expect(page.getByText("Genre saved")).toBeVisible();
    const row = page.getByTestId("genre-row").filter({ hasText: renamed });
    await expect(row).toContainText("Hidden");
    expect(await publicNames()).not.toContain(renamed);

    // 4. a duplicate name is refused, and an unused genre can be deleted
    await page.getByTestId("add-genre").click();
    await page.getByTestId("genre-name").fill(renamed.toUpperCase());
    await page.getByTestId("save-genre").click();
    await expect(page.getByText("That genre already exists")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: `Delete ${renamed}` }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(`${renamed} removed`)).toBeVisible();
    await expect(page.getByTestId("genre-row").filter({ hasText: renamed })).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("a genre that titles use cannot be deleted, and the server says why", async () => {
  const admin = asAdmin();
  const all = (await admin.get<Array<{ id: string; name: string; usage: number }>>("/admin/genres")).data;
  const inUse = all.find((g) => g.usage > 0);
  test.skip(!inUse, "no genre is used by a title in this database");
  const res = await admin.raw("DELETE", `/admin/genres/${inUse!.id}`);
  expect(res.status).toBe(409);
  expect(JSON.stringify(await res.json())).toMatch(/used by \d+ title/);
});
