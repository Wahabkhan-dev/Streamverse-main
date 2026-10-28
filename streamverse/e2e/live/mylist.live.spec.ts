import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { asUser } from "./lib/auth";
import { SEED_FILE, USER_STATE } from "./lib/env";
import { track } from "./lib/net";
import type { Seed } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
test.use({ storageState: USER_STATE });

// both endpoints return content cards: `id` is the content id
const listIds = async (path: "/me/my-list" | "/me/library") =>
  ((await asUser().get<Array<{ id: string }>>(path)).data ?? []).map((e) => e.id);
const ensureAbsent = async (path: "/me/my-list" | "/me/library", id: string) => {
  await asUser()
    .del(`${path}/${id}`)
    .catch(() => undefined);
};

test.describe("My List is stored in MySQL, not the browser", () => {
  test.beforeEach(() => ensureAbsent("/me/my-list", seed.movie.id));
  test.afterEach(() => ensureAbsent("/me/my-list", seed.movie.id));

  test("add -> persists across reload and a brand-new browser context -> appears on /my-list -> remove", async ({
    page,
    browser,
  }) => {
    await page.goto(`/movies/${seed.movie.slug}`);
    const btn = page.getByRole("button", { name: /^(In )?My List$/ });
    await expect(btn).toHaveAttribute("aria-pressed", "false");

    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(await listIds("/me/my-list"), "the title must be in the database list").toContain(
      seed.movie.id,
    );

    await page.reload();
    await expect(page.getByRole("button", { name: /^(In )?My List$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // a fresh context shares only the account (via its own session), NOT this browser's localStorage
    const other = await browser.newContext({ storageState: USER_STATE });
    const op = await other.newPage();
    await op.goto(`/movies/${seed.movie.slug}`);
    await expect(op.getByRole("button", { name: /^(In )?My List$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await other.close();

    await page.goto("/my-list");
    await expect(page.getByText(seed.movie.title).first()).toBeVisible();

    await page.goto(`/movies/${seed.movie.slug}`);
    await page.getByRole("button", { name: /^In My List$/ }).click();
    await expect(page.getByRole("button", { name: /^My List$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(await listIds("/me/my-list")).not.toContain(seed.movie.id);
  });

  test("double-clicking creates exactly one request (the button is disabled while saving)", async ({
    page,
  }) => {
    const net = track(page);
    await page.goto(`/movies/${seed.movie.slug}`);
    const btn = page.getByRole("button", { name: /^My List$/ });
    await btn.dblclick();
    await expect(page.getByRole("button", { name: /^In My List$/ })).toBeVisible();
    expect(
      net.calls.filter((c) => c.method === "POST" && c.path.startsWith("/me/my-list")).length,
    ).toBe(1);
    expect((await listIds("/me/my-list")).filter((id) => id === seed.movie.id).length).toBe(1);
  });
});

test.describe("Library is stored in MySQL", () => {
  test.beforeEach(() => ensureAbsent("/me/library", seed.ebookEpub.id));
  test.afterEach(() => ensureAbsent("/me/library", seed.ebookEpub.id));

  test("eBook: add -> persists -> shows on /my-library", async ({ page }) => {
    await page.goto(`/ebooks/${seed.ebookEpub.slug}`);
    const btn = page.getByRole("button", { name: /^(Add to Library|In Library)$/ });
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(await listIds("/me/library")).toContain(seed.ebookEpub.id);
    await page.goto("/my-library");
    await expect(page.getByText(seed.ebookEpub.title).first()).toBeVisible();
  });
});
