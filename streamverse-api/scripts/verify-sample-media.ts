/**
 * Phase 3 check, through the real HTTP API as a subscribed customer: every seeded sample title that was given a file must
 * actually play / open / be listenable. Creates (once) a LOCAL TEST subscription for the e2e customer so entitlements are real;
 * it is a local fixture row, not a Stripe payment. Read-only apart from that fixture.
 */
import "dotenv/config";
import { prisma } from "../src/config/database";

const API = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";
const EMAIL = process.env["E2E_USER_EMAIL"] ?? "e2e-user@streamverse.test";
const PASSWORD = process.env["E2E_USER_PASSWORD"] ?? "E2e-Live-User-Pass-1!";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const plan = await prisma.plan.findUniqueOrThrow({ where: { slug: "premium" } });
  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: { userId: user.id, planId: plan.id, stripeCustomerId: `cus_localtest_${user.id}`, stripeSubscriptionId: `sub_localtest_${user.id}`, stripePriceId: plan.stripePriceId, status: "ACTIVE" },
    update: { planId: plan.id, status: "ACTIVE" },
  });
  const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json();
  const H = { Authorization: `Bearer ${login.data.accessToken}`, "Content-Type": "application/json" };

  const titles = await prisma.content.findMany({ where: { deletedAt: null, status: "PUBLISHED", NOT: { title: { startsWith: "E2E" } } }, select: { id: true, title: true, type: true } });
  let ok = 0;
  let bad = 0;
  for (const t of titles) {
    const kind = t.type === "MOVIE" ? "movies" : t.type === "EBOOK" ? "ebooks" : "audiobooks";
    const path = t.type === "MOVIE" ? "playback" : t.type === "EBOOK" ? "access" : "playback";
    // end any stream session left by the previous title so the concurrent-stream limit never interferes
    const res = await fetch(`${API}/media/${kind}/${t.id}/${path}`, { method: "POST", headers: H, body: "{}" });
    const j = (await res.json()) as { data?: { playback?: { url?: string } | null; signedUrl?: string | null; sessionId?: string; access?: { reason?: string } } };
    const url = j.data?.playback?.url ?? j.data?.signedUrl;
    let verdict = "FAIL";
    if (url) {
      const probe = await fetch(url, { headers: t.type === "MOVIE" ? {} : { Range: "bytes=0-1023" } });
      verdict = probe.status === 200 || probe.status === 206 ? "OK" : `HTTP ${probe.status}`;
    } else verdict = `no url (${j.data?.access?.reason ?? res.status})`;
    if (j.data?.sessionId) await fetch(`${API}/me/playback-sessions/${j.data.sessionId}/end`, { method: "POST", headers: H, body: "{}" });
    console.log(`${verdict === "OK" ? "PASS" : "FAIL"}  ${t.type.padEnd(9)} ${t.title.padEnd(26)} ${verdict}`);
    verdict === "OK" ? ok++ : bad++;
  }
  console.log(`\n${ok} playable/readable, ${bad} not`);
  await prisma.$disconnect();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
