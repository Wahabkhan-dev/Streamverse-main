import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { Api } from "./lib/api";
import {
  ADMIN,
  ADMIN_STATE,
  API,
  SEED_FILE,
  STATE_DIR,
  TOKEN_KEY,
  USER,
  USER_B,
  USER_STATE,
  WEB,
} from "./lib/env";
import { seedAll } from "./lib/seed";

async function ensureRegistered(u: { email: string; password: string; fullName: string }) {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: u.email, password: u.password, fullName: u.fullName }),
  });
  // 409 = already registered from a previous run; 403 REGISTRATION_DISABLED = the admin turned sign-ups off in Settings, so
  // the users from earlier runs are used as they are (the sign-in that follows fails loudly if one does not exist)
  if (res.ok || res.status === 409) return;
  const body = await res.text();
  if (res.status === 403 && body.includes("REGISTRATION_DISABLED")) return;
  throw new Error(`register ${u.email} -> ${res.status} ${body.slice(0, 200)}`);
}

/** Logs in through the REAL sign-in form (no stubbed state), saves cookies + localStorage, returns the access token. */
async function loginViaUi(
  who: string,
  creds: { email: string; password: string },
  stateFile: string,
): Promise<string> {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${WEB}/sign-in`);
    // wait for hydration: submitting before React attaches its handler does a native form submit and never logs in
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email address").fill(creds.email);
    await page.getByLabel("Password", { exact: true }).fill(creds.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .waitForFunction((k) => !!localStorage.getItem(k), TOKEN_KEY, { timeout: 20_000 })
      .catch(async () => {
        const text = ((await page.locator("body").textContent()) ?? "")
          .replace(/\s+/g, " ")
          .slice(0, 300);
        throw new Error(`${who} UI login did not produce a session. Page says: ${text}`);
      });
    const token = await page.evaluate((k) => localStorage.getItem(k) as string, TOKEN_KEY);
    await page.context().storageState({ path: stateFile });
    return token;
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(_config: FullConfig) {
  if (!ADMIN.email || !ADMIN.password)
    throw new Error(
      "No admin credentials: set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD (or ADMIN_* in streamverse-api/.env)",
    );
  mkdirSync(STATE_DIR, { recursive: true });

  await ensureRegistered(USER);
  await ensureRegistered(USER_B);

  const adminToken = await loginViaUi("admin", ADMIN, ADMIN_STATE);
  await loginViaUi("user", USER, USER_STATE);

  const seed = await seedAll(new Api(adminToken));
  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
  console.log("[live-e2e] seeded real media:", JSON.stringify(seed));
}
