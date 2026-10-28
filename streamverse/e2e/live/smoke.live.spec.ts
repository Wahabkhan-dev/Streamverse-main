import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { SEED_FILE } from "./lib/env";

test("global setup produced real seeded media", async () => {
  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8"));
  for (const k of ["movie", "ebookEpub", "ebookPdf", "audiobook"]) expect(seed[k].id).toBeTruthy();
});
