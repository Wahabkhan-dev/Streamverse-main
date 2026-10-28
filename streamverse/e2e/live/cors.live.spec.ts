import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { asUser } from "./lib/auth";
import { SEED_FILE, USER_STATE } from "./lib/env";
import type { Seed } from "./lib/seed";

const seed: Seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
test.use({ storageState: USER_STATE });

/**
 * BLOCKED EXTERNAL: the R2 bucket `stream-verse` has no CORS policy, and the app's R2 token (correctly) cannot set
 * one. Until a bucket admin applies the policy (see scripts/configure-r2-cors.ts), a real browser cannot fetch
 * private media (HLS segments, EPUB, PDF) or PUT uploads directly.
 *
 * `test.fail` keeps this suite green while the block exists and turns it RED the moment CORS is fixed, which is the
 * prompt to delete the annotation and promote the *.r2.live.spec.ts specs to the normal browser project.
 */
test("browser can GET a signed private R2 object from the app origin (needs bucket CORS)", async ({
  page,
}) => {
  test.fail(true, "BLOCKED EXTERNAL: R2 bucket CORS is not configured");
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
