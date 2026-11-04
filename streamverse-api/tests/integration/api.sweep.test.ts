import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["RATE_LIMIT_MULTIPLIER"] = "1000";
});
vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});
vi.mock("../../src/services/stripe/stripe.service", () => import("../fakes/stripeService.fake.js"));

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";

/**
 * "Something went wrong" is what a customer sees when the server answers 500. This calls EVERY route the server defines (any
 * method) as a guest, as a customer and as an admin, with empty or nonsense input, and requires that none of them ever crashes:
 * a bad request must be answered with a proper 4xx, never a 500.
 */

type Route = { method: string; path: string };
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** The path of a mounted router layer, rebuilt from Express 4's regexp. */
function mountPath(layer: { regexp: RegExp; keys?: { name: string }[] }): string {
  const src = layer.regexp.source.replace("\\/?(?=\\/|$)", "").replace(/^\^/, "").replace(/\\\//g, "/");
  return src === "(?:)" ? "" : src.replace(/\$$/, "");
}

function collect(app: Express): Route[] {
  const out: Route[] = [];
  type Layer = { route?: { path: string | string[]; methods: Record<string, boolean> }; name?: string; handle?: { stack?: Layer[] }; regexp: RegExp; keys?: { name: string }[] };
  const walk = (stack: Layer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        for (const p of paths) for (const m of METHODS) if (layer.route.methods[m]) out.push({ method: m, path: prefix + (p === "/" ? "" : p) });
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPath(layer));
      }
    }
  };
  walk((app as unknown as { _router: { stack: Layer[] } })._router.stack, "");
  return out;
}

const fill = (path: string) => path.replace(/:([A-Za-z]+)(\([^)]*\))?\??/g, "nonexistent-id") || "/";

const SKIP = [
  /\/auth\/logout/, // clears the session used by the rest of the sweep
  /\/webhooks\//, // Stripe signs these; covered by the webhook tests
];

describe("API sweep: no route ever answers 500 (\"Something went wrong\")", () => {
  let app: Express;
  let routes: Route[];
  let tokens: Record<"guest" | "customer" | "admin", string | null>;

  beforeAll(async () => {
    app = createApp();
    routes = collect(app).filter((r) => !SKIP.some((s) => s.test(r.path)));
    await createTestPlan();
    const customer = await createUser(app);
    const admin = await createAdmin(app, prisma as never);
    tokens = { guest: null, customer: customer.accessToken, admin: admin.accessToken };
  });

  it("finds a realistic number of routes (so the sweep is not silently empty)", () => {
    expect(routes.length).toBeGreaterThan(150);
    expect(routes.some((r) => r.path === "/api/v1/me/subscription/change-plan" && r.method === "post")).toBe(true);
    expect(routes.some((r) => r.path === "/api/v1/admin/notifications/announce")).toBe(true);
  });

  it.each(["guest", "customer", "admin"] as const)("as a %s, no route crashes", async (who) => {
    const crashes: string[] = [];
    for (const r of routes) {
      const url = fill(r.path);
      let req = (request(app) as unknown as Record<string, (u: string) => request.Test>)[r.method]!(url);
      const token = tokens[who];
      if (token) req = req.set("Authorization", `Bearer ${token}`);
      if (r.method !== "get" && r.method !== "delete") req = req.send({});
      const res = await req;
      if (res.status >= 500) crashes.push(`${r.method.toUpperCase()} ${url} -> ${res.status} ${JSON.stringify(res.body).slice(0, 140)}`);
    }
    expect(crashes, `\n${crashes.join("\n")}\n`).toEqual([]);
  }, 120_000);
});
