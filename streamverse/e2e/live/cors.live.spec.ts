import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { asUser } from "./lib/auth";
import { SEED_FILE, USER_STATE } from "./lib/env";
import type { Seed } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
test.use({ storageState: USER_STATE });

/**
 * The R2 bucket `stream-verse` has a CORS policy for the app's origin (see scripts/configure-r2-cors.ts): a normal browser,
 * with web security on, can fetch private media (HLS segments, EPUB, PDF) through a signed link. This was BLOCKED EXTERNAL
 * until the policy was applied; the *.r2.live.spec.ts specs now run in a normal browser too.
 */
test("browser can GET a signed private R2 object from the app origin (needs bucket CORS)", async ({
  page,
}) => {
  await page.goto("/");
  const pb = await asUser().post<{ playback: { url: string } }>(
    `/media/audiobooks/${seed.audiobook.id}/playback`,
  );
  const url = pb.data.playback.url;
  const result = await page.evaluate(async (u) => {
    try {
      const r = await fetch(u, { headers: { Range: "bytes=0-99" } });
      return { ok: true, status: r.status };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, url);
  expect(result.ok, `cross-origin fetch result: ${JSON.stringify(result)}`).toBe(true);
});
