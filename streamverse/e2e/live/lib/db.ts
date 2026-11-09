import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Direct, READ-mostly access to the backend's MySQL for the live QA specs, so a test can prove what was really stored
 * (frontend success alone proves nothing). Uses the backend's own Prisma client and DATABASE_URL, and refuses anything
 * that is not a local database.
 */
const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, "../../../../streamverse-api");

function databaseUrl(): string {
  const text = readFileSync(resolve(backend, ".env"), "utf8");
  const m = text.match(/^DATABASE_URL=(.*)$/m);
  const url = (m?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("db helper: DATABASE_URL is not a local database; refusing");
  return url;
}

type AnyClient = Record<string, any> & { $disconnect: () => Promise<void> };
let client: AnyClient | null = null;

export function db(): AnyClient {
  if (client) return client;
  const req = createRequire(resolve(backend, "package.json"));
  const { PrismaClient } = req("@prisma/client") as { PrismaClient: new (o: object) => AnyClient };
  client = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  return client;
}

export async function closeDb() {
  await client?.$disconnect();
  client = null;
}
