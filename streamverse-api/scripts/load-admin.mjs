/**
 * Load test for the admin API (and the public pages an admin also triggers): for each endpoint, N concurrent clients hit it
 * for a few seconds, and the report gives requests/second, latency percentiles and every non-200 answer.
 *
 *   node scripts/load-admin.mjs                       default: levels 1,10,25,50 for 4 seconds each
 *   node scripts/load-admin.mjs --levels=10,50 --seconds=6 --only=dashboard,movies
 *
 * Uses the admin account from .env (ADMIN_EMAIL / ADMIN_PASSWORD). Read-only GETs: safe on a development database.
 */
import { readFileSync } from "node:fs";

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const LEVELS = arg("levels", "1,10,25,50").split(",").map(Number);
const SECONDS = Number(arg("seconds", "4"));
const ONLY = arg("only", "").split(",").filter(Boolean);
const API = process.env.API_URL ?? "http://localhost:4000/api/v1";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const ENDPOINTS = [
  ["dashboard", "/admin/dashboard"],
  ["movies", "/admin/movies?limit=20"],
  ["ebooks", "/admin/ebooks?limit=20"],
  ["audiobooks", "/admin/audiobooks?limit=20"],
  ["genres", "/admin/genres"],
  ["collections", "/admin/collections?limit=50"],
  ["homepage", "/admin/homepage/sections?limit=100"],
  ["banners", "/admin/banners?limit=50"],
  ["media", "/admin/media?limit=24"],
  ["media-stats", "/admin/media/stats"],
  ["users", "/admin/users?limit=20"],
  ["subscriptions", "/admin/subscriptions?limit=20"],
  ["payments", "/admin/payments?limit=20"],
  ["settings", "/admin/settings"],
  ["legal", "/admin/legal"],
  ["public-homepage", "/homepage?offset=0&limit=2"],
  ["public-movies", "/movies?limit=20"],
].filter(([name]) => !ONLY.length || ONLY.includes(name));

async function login() {
  const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
  if (!res.ok) throw new Error(`admin login failed (${res.status}); set ADMIN_EMAIL/ADMIN_PASSWORD in .env`);
  return (await res.json()).data.accessToken;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

async function hit(token, path, clients) {
  const lat = [];
  const bad = new Map();
  const end = Date.now() + SECONDS * 1000;
  const worker = async () => {
    while (Date.now() < end) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
        await res.arrayBuffer();
        lat.push(performance.now() - t0);
        if (res.status !== 200) bad.set(res.status, (bad.get(res.status) ?? 0) + 1);
      } catch (e) {
        bad.set(`net:${e.cause?.code ?? e.message}`, (bad.get(`net:${e.cause?.code ?? e.message}`) ?? 0) + 1);
      }
    }
  };
  await Promise.all(Array.from({ length: clients }, worker));
  lat.sort((a, b) => a - b);
  return { n: lat.length, rps: lat.length / SECONDS, p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), bad };
}

const token = await login();
console.log(`API ${API}   ${SECONDS}s per level   levels ${LEVELS.join(", ")}\n`);
console.log("endpoint".padEnd(18), "clients".padStart(7), "req/s".padStart(8), "p50 ms".padStart(8), "p95 ms".padStart(8), "p99 ms".padStart(8), "  errors");
let failures = 0;
for (const [name, path] of ENDPOINTS) {
  for (const clients of LEVELS) {
    const r = await hit(token, path, clients);
    const errors = [...r.bad].map(([k, v]) => `${k}×${v}`).join(" ");
    if (r.bad.size) failures++;
    console.log(name.padEnd(18), String(clients).padStart(7), r.rps.toFixed(0).padStart(8), r.p50.toFixed(0).padStart(8), r.p95.toFixed(0).padStart(8), r.p99.toFixed(0).padStart(8), " ", errors || "-");
  }
}
console.log(failures ? `\n${failures} level(s) returned errors` : "\nno errors at any level");
process.exit(failures ? 1 : 0);
