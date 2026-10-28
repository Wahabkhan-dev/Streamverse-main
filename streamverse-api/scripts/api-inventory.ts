/**
 * Phase 1/20: enumerates every route the backend really mounts and every API call the frontend source makes, then matches
 * them. Read-only: it loads the Express app (no server, no database writes) and scans files.
 *   npx tsx scripts/api-inventory.ts [--json] [--unused]
 */
import "dotenv/config";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createApp } from "../src/app";

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: { name?: string } }> };
  name: string;
  handle: { stack?: Layer[] };
  regexp: RegExp;
}

/** Express keeps a mount path as a regex; turn "^\/api\/v1\/admin\/?(?=\/|$)" back into "/api/v1/admin". */
function mountOf(re: RegExp): string {
  let s = re.source;
  s = s.replace(/^\^/, "").replace(/\\\/\?\(\?=\\\/\|\$\)$/, "").replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ":param").replace(/\\\//g, "/");
  return s === "" || s === "/" ? "" : s;
}

const routes: Array<{ method: string; path: string; handler: string }> = [];
function walk(stack: Layer[], prefix: string) {
  for (const l of stack) {
    if (l.route) {
      for (const m of Object.keys(l.route.methods)) {
        const full = (prefix + l.route.path).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
        routes.push({ method: m.toUpperCase(), path: full, handler: l.route.stack.at(-1)?.handle.name || "handler" });
      }
    } else if (l.name === "router" && l.handle.stack) walk(l.handle.stack, prefix + mountOf(l.regexp));
  }
}
const app = createApp() as unknown as { _router: { stack: Layer[] } };
walk(app._router.stack, "");
const backend = routes.filter((r) => r.path.startsWith("/api/v1")).map((r) => ({ ...r, path: r.path.replace("/api/v1", "") || "/" }));

const norm = (p: string) => p.replace(/:[A-Za-z0-9_]+/g, ":param");
const apiDir = resolve("../streamverse/src/api");
const calls: Array<{ file: string; method: string; path: string }> = [];
for (const f of readdirSync(apiDir).filter((f) => f.endsWith(".ts"))) {
  const text = readFileSync(join(apiDir, f), "utf8");
  // api.get<...>("/x") / api.post(`/x/${id}`) , the generic argument may itself contain parentheses and angle brackets
  const re = /\bapi\s*\.\s*(get|post|put|patch|delete)\b[\s\S]{0,400}?\(\s*([`"'])((?:\\.|(?!\2)[^\\])*)\2/g;
  for (const m of text.matchAll(re)) {
    const raw = m[3]!;
    if (!raw.startsWith("/")) continue;
    const path = flattenTemplate(raw).split("?")[0]!.replace(/\/$/, "");
    calls.push({ file: f, method: m[1]!.toUpperCase(), path });
  }
}
/** "/x/${id}" -> "/x/:param"; "/x${toQuery(p)}" -> "/x" (a suffix glued to the path is a query string). Handles nested braces. */
function flattenTemplate(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "$" && raw[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      while (j < raw.length && depth) {
        if (raw[j] === "{") depth++;
        else if (raw[j] === "}") depth--;
        j++;
      }
      out += out.endsWith("/") ? ":param" : "";
      i = j - 1;
    } else out += raw[i];
  }
  return out;
}
const table = new Map(backend.map((r) => [`${r.method} ${norm(r.path)}`, r]));
const rows = calls.map((c) => {
  const hit = table.get(`${c.method} ${norm(c.path)}`);
  return { ...c, status: hit ? "PASS" : "MISSING", handler: hit?.handler ?? "" };
});
const key = (r: { method: string; path: string }) => `${r.method} ${norm(r.path)}`;
const used = new Set(rows.map(key));
const unused = backend.filter((r) => !used.has(key(r)) && !r.path.startsWith("/dev/"));
const counts = new Map<string, number>();
for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
const dup = [...counts].filter(([, n]) => n > 1).map(([k]) => k);

console.log(`backend routes: ${backend.length}`);
console.log(`frontend call sites: ${rows.length} (${used.size} distinct)`);
console.log(`PASS ${rows.filter((r) => r.status === "PASS").length}   MISSING ${rows.filter((r) => r.status === "MISSING").length}   defined more than once ${dup.length}   backend routes the frontend never calls ${unused.length}`);
for (const r of rows.filter((r) => r.status === "MISSING")) console.log(`  MISSING  ${r.method.padEnd(6)} ${r.path}   (${r.file})`);
for (const k of dup) console.log(`  DUPLICATE ${k}`);
if (process.argv.includes("--json")) writeFileSync("../streamverse/scratch/api-inventory.json", JSON.stringify({ rows, unused, dup, backend }, null, 2));
if (process.argv.includes("--unused")) for (const r of unused) console.log(`  unused   ${r.method.padEnd(6)} ${r.path}`);
