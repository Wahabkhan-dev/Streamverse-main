/**
 * Default subscription plans (the product's own plan design): Basic, Standard, Premium and Premium Annual.
 *
 * IDEMPOTENT: plans are matched by slug and Stripe objects by `lookup_key`, so running it again never creates a duplicate.
 *
 *   npx tsx scripts/seed-plans.ts            uses the Stripe TEST key in .env to create/find the Products + Prices
 *   npx tsx scripts/seed-plans.ts --offline  no Stripe: creates the plans with clearly fake price ids so the plan screens
 *                                            work; checkout stays impossible until the real run replaces them
 *
 * A plan that already carries a real Stripe price id is never overwritten by an offline run.
 */
import "dotenv/config";
import { prisma } from "../src/config/database";

interface Seed {
  slug: string;
  name: string;
  description: string;
  amount: number; // minor units
  interval: "MONTHLY" | "YEARLY";
  features: string[];
  maxDevices: number | null;
  maxConcurrentStreams: number | null;
  maxVideoQuality: "480p" | "720p" | "1080p" | "4K" | null;
  movies: boolean;
  ebooks: boolean;
  audiobooks: boolean;
}

export const DEFAULT_PLANS: Seed[] = [
  { slug: "basic", name: "Basic", description: "HD movies on one screen", amount: 699, interval: "MONTHLY", features: ["HD movies", "1 screen"], maxDevices: 2, maxConcurrentStreams: 1, maxVideoQuality: "720p", movies: true, ebooks: false, audiobooks: false },
  { slug: "standard", name: "Standard", description: "Full HD, eBooks, 2 screens", amount: 1299, interval: "MONTHLY", features: ["Full HD", "eBooks", "2 screens"], maxDevices: 3, maxConcurrentStreams: 2, maxVideoQuality: "1080p", movies: true, ebooks: true, audiobooks: false },
  { slug: "premium", name: "Premium", description: "4K HDR, eBooks, Audiobooks, 4 screens", amount: 1999, interval: "MONTHLY", features: ["4K HDR", "eBooks", "Audiobooks", "4 screens"], maxDevices: 5, maxConcurrentStreams: 4, maxVideoQuality: "4K", movies: true, ebooks: true, audiobooks: true },
  { slug: "premium-annual", name: "Premium Annual", description: "Everything in Premium, 2 months free", amount: 19900, interval: "YEARLY", features: ["Everything in Premium", "2 months free"], maxDevices: 5, maxConcurrentStreams: 4, maxVideoQuality: "4K", movies: true, ebooks: true, audiobooks: true },
];

const KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const offline = process.argv.includes("--offline");

async function stripe(method: "GET" | "POST", path: string, form?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(form ? { body: new URLSearchParams(form).toString() } : {}),
  });
  const json = (await res.json()) as { error?: { message: string } } & Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

/** Find-or-create the Product and recurring Price for one plan, keyed by lookup_key so a re-run reuses them. */
async function ensureStripePrice(p: Seed): Promise<{ priceId: string; productId: string }> {
  const lookup = `streamverse_${p.slug}_${p.amount}`;
  const found = (await stripe("GET", `/prices?lookup_keys[]=${encodeURIComponent(lookup)}&active=true&limit=1`)) as { data: Array<{ id: string; product: string }> };
  if (found.data[0]) return { priceId: found.data[0].id, productId: found.data[0].product };
  const product = (await stripe("POST", "/products", { name: `StreamVerse ${p.name}`, description: p.description, "metadata[slug]": p.slug })) as { id: string };
  const price = (await stripe("POST", "/prices", {
    product: product.id,
    unit_amount: String(p.amount),
    currency: "usd",
    "recurring[interval]": p.interval === "YEARLY" ? "year" : "month",
    lookup_key: lookup,
  })) as { id: string };
  return { priceId: price.id, productId: product.id };
}

async function main() {
  if (!offline && !/^sk_test_[A-Za-z0-9]{16,}/.test(KEY)) {
    throw new Error("STRIPE_SECRET_KEY in .env is missing or not a real Stripe TEST key. Put your test key there (sk_test_...), or run with --offline to create the plans without Stripe.");
  }
  if (!offline && KEY.startsWith("sk_live_")) throw new Error("Refusing to run against a LIVE Stripe key.");

  let order = 0;
  for (const p of DEFAULT_PLANS) {
    const existing = await prisma.plan.findUnique({ where: { slug: p.slug } });
    let priceId: string;
    let productId: string | null = null;
    if (offline) {
      if (existing && !existing.stripePriceId.startsWith("price_offline_")) {
        console.log(`keep    ${p.slug} (already has real Stripe price ${existing.stripePriceId})`);
        order++;
        continue;
      }
      priceId = `price_offline_${p.slug}`;
    } else {
      ({ priceId, productId } = await ensureStripePrice(p));
    }
    const data = {
      name: p.name,
      description: p.description,
      stripePriceId: priceId,
      ...(productId ? { stripeProductId: productId } : {}),
      priceAmount: p.amount,
      currency: "usd",
      billingInterval: p.interval,
      features: p.features,
      maxDevices: p.maxDevices,
      maxConcurrentStreams: p.maxConcurrentStreams,
      maxVideoQuality: p.maxVideoQuality,
      moviesEnabled: p.movies,
      ebooksEnabled: p.ebooks,
      audiobooksEnabled: p.audiobooks,
      active: existing?.active ?? true,
      displayOrder: order++,
    };
    await prisma.plan.upsert({ where: { slug: p.slug }, create: { slug: p.slug, ...data }, update: data });
    console.log(`${existing ? "update " : "create "} ${p.slug.padEnd(15)} ${priceId}${offline ? "  (OFFLINE placeholder: checkout will not work)" : ""}`);
  }
  console.log(`\n${await prisma.plan.count()} plans in the database.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
