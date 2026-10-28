import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const WEB = process.env["E2E_BASE_URL"] ?? "http://localhost:8080";
export const API = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";
export const FIXTURES = resolve(here, "../.fixtures");
export const STATE_DIR = resolve(here, "../.state");
export const ADMIN_STATE = join(STATE_DIR, "admin.json");
export const USER_STATE = join(STATE_DIR, "user.json");
export const SEED_FILE = join(STATE_DIR, "seed.json");
export const SEED_PREFIX = "E2E Live";

/** Local-dev convenience only: reads the backend's own .env so no credential is ever copied into the repo. */
function backendEnv(): Record<string, string> {
  const file = resolve(here, "../../../../streamverse-api/.env");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

const be = backendEnv();

export const ADMIN = {
  email: process.env["E2E_ADMIN_EMAIL"] ?? be["ADMIN_EMAIL"] ?? "",
  password: process.env["E2E_ADMIN_PASSWORD"] ?? be["ADMIN_PASSWORD"] ?? "",
};

export const USER = {
  email: process.env["E2E_USER_EMAIL"] ?? "e2e-user@streamverse.test",
  password: process.env["E2E_USER_PASSWORD"] ?? "E2e-Live-User-Pass-1!",
  fullName: "E2E Live User",
};

/** A second, independent customer used to prove one user's data never leaks to another. */
export const USER_B = {
  email: process.env["E2E_USER_B_EMAIL"] ?? "e2e-user-b@streamverse.test",
  password: process.env["E2E_USER_B_PASSWORD"] ?? "E2e-Live-User-B-Pass-1!",
  fullName: "E2E Live User B",
};

export const TOKEN_KEY = "sv-access-token";
