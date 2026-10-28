import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["RATE_LIMIT_MULTIPLIER"] = "100";
});
vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin } from "../helpers/adminAuth";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();
beforeEach(() => db.__reset());

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

function fakeJpeg(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof0 = Buffer.alloc(19);
  sof0.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0.set([0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01], 9);
  return Buffer.concat([soi, app0, sof0, Buffer.from([0xff, 0xd9])]);
}

async function libraryImage(headers: Record<string, string>) {
  const bytes = fakeJpeg(1400, 500);
  const p = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ library: true, purpose: "LIBRARY_IMAGE", fileName: "b.jpg", mimeType: "image/jpeg", sizeBytes: bytes.length });
  await request(app).put(p.body.data.uploadUrl).set("Content-Type", "image/jpeg").send(bytes);
  await request(app).post(`/api/v1/admin/uploads/${p.body.data.assetId}/complete`).set(headers).send({});
  return p.body.data.assetId as string;
}

const section = (headers: Record<string, string>, body: Record<string, unknown>) => request(app).post("/api/v1/admin/homepage/sections").set(headers).send(body);

describe("homepage: banner and collection sections, positions, paging", () => {
  it("a banner is created once, then placed on the homepage by a section whose displayOrder is its position", async () => {
    const h = await admin();
    const image = await libraryImage(h);
    const banner = await request(app).post("/api/v1/admin/banners").set(h).send({ type: "NORMAL", title: "Autumn", desktopAssetId: image });
    expect(banner.status).toBe(201);

    // creating the banner alone does NOT put it on the homepage
    expect((await request(app).get("/api/v1/homepage")).body.data).toEqual([]);

    await section(h, { key: "row_a", displayTitle: "Row A", type: "MANUAL", displayOrder: 0 });
    await section(h, { key: "promo_slot", displayTitle: "Promo", type: "BANNER", bannerId: banner.body.data.id, displayOrder: 1 });
    await section(h, { key: "row_b", displayTitle: "Row B", type: "MANUAL", displayOrder: 2 });

    const home = await request(app).get("/api/v1/homepage");
    expect(home.body.data.map((s: { key: string }) => s.key)).toEqual(["row_a", "promo_slot", "row_b"]);
    const slot = home.body.data[1];
    expect(slot.kind).toBe("banner");
    expect(slot.banner).toMatchObject({ id: banner.body.data.id, title: "Autumn", type: "NORMAL" });
    expect(slot.banner.image).toBeTruthy();
    expect(JSON.stringify(home.body)).not.toMatch(/storageKey/);

    // moving it is just a different displayOrder
    await request(app).put(`/api/v1/admin/homepage/sections/${home.body.data[1].id}`).set(h).send({ displayOrder: 5 });
    const moved = await request(app).get("/api/v1/homepage");
    expect(moved.body.data.map((s: { key: string }) => s.key)).toEqual(["row_a", "row_b", "promo_slot"]);
  });

  it("many banner sections are allowed, and an inactive banner renders as nothing instead of a broken slot", async () => {
    const h = await admin();
    const image = await libraryImage(h);
    const a = await request(app).post("/api/v1/admin/banners").set(h).send({ type: "NORMAL", title: "A", desktopAssetId: image });
    const b = await request(app).post("/api/v1/admin/banners").set(h).send({ type: "PROMOTIONAL", title: "B", desktopAssetId: image, active: false });
    for (let i = 0; i < 4; i++) expect((await section(h, { key: `bn_${i}`, displayTitle: `Banner ${i}`, type: "BANNER", bannerId: i === 3 ? b.body.data.id : a.body.data.id, displayOrder: i })).status).toBe(201);
    const home = await request(app).get("/api/v1/homepage");
    expect(home.body.data).toHaveLength(4);
    expect(home.body.data[0].banner).toBeTruthy();
    expect(home.body.data[3].banner).toBeNull(); // inactive banner: the page skips it
  });

  it("a banner or collection section must name something that exists", async () => {
    const h = await admin();
    expect((await section(h, { key: "x1", displayTitle: "X", type: "BANNER" })).status).toBe(400);
    expect((await section(h, { key: "x2", displayTitle: "X", type: "BANNER", bannerId: "nope" })).status).toBe(404);
    expect((await section(h, { key: "x3", displayTitle: "X", type: "COLLECTION" })).status).toBe(400);
    expect((await section(h, { key: "x4", displayTitle: "X", type: "COLLECTION", collectionId: "nope" })).status).toBe(404);
  });

  it("returns the homepage in slices (first two sections first) with the total, resolving only that slice", async () => {
    const h = await admin();
    for (let i = 0; i < 5; i++) await section(h, { key: `s${i}`, displayTitle: `S${i}`, type: "MANUAL", displayOrder: i });
    const first = await request(app).get("/api/v1/homepage?offset=0&limit=2");
    expect(first.body.data.map((s: { key: string }) => s.key)).toEqual(["s0", "s1"]);
    expect(first.body.pagination).toMatchObject({ total: 5, limit: 2 });
    const rest = await request(app).get("/api/v1/homepage?offset=2&limit=100");
    expect(rest.body.data.map((s: { key: string }) => s.key)).toEqual(["s2", "s3", "s4"]);
    expect((await request(app).get("/api/v1/homepage?limit=1000")).status).toBe(400);
  });

  it("disabled sections never reach customers, and every kind of change shows up immediately", async () => {
    const h = await admin();
    const created = await section(h, { key: "only", displayTitle: "Only", type: "MANUAL", displayOrder: 0 });
    expect((await request(app).get("/api/v1/homepage")).body.data).toHaveLength(1);
    await request(app).put(`/api/v1/admin/homepage/sections/${created.body.data.id}`).set(h).send({ enabled: false });
    expect((await request(app).get("/api/v1/homepage")).body.data).toHaveLength(0);
  });
});

describe("a banner decides for itself whether and where it appears on the homepage", () => {
  it("top / after a named section / bottom, never twice, never for hero banners, gone when switched off", async () => {
    const h = await admin();
    const image = await libraryImage(h);
    await section(h, { key: "row_a", displayTitle: "Row A", type: "MANUAL", displayOrder: 0 });
    await section(h, { key: "row_b", displayTitle: "Row B", type: "MANUAL", displayOrder: 1 });
    const make = (title: string, extra: Record<string, unknown>) => request(app).post("/api/v1/admin/banners").set(h).send({ type: "NORMAL", title, desktopAssetId: image, ...extra });

    const top = await make("Top", { showOnHomepage: true, homepageAfter: "top" });
    const mid = await make("Mid", { showOnHomepage: true, homepageAfter: "row_a" });
    await make("Bottom", { showOnHomepage: true });
    await make("Hidden", {});
    expect([top.status, mid.status]).toEqual([201, 201]);

    const titles = async () => (await request(app).get("/api/v1/homepage")).body.data.map((s: { kind: string; banner?: { title: string }; key: string }) => (s.kind === "banner" ? `banner:${s.banner?.title}` : s.key));
    expect(await titles()).toEqual(["banner:Top", "row_a", "banner:Mid", "row_b", "banner:Bottom"]);

    // a banner already placed by a Banner section is not shown a second time
    await section(h, { key: "slot", displayTitle: "Slot", type: "BANNER", bannerId: mid.body.data.id, displayOrder: 2 });
    expect((await titles()).filter((t: string) => t === "banner:Mid")).toHaveLength(1);

    // switching it off removes it at once (the cache is dropped by the admin write)
    await request(app).put(`/api/v1/admin/banners/${top.body.data.id}`).set(h).send({ showOnHomepage: false });
    expect(await titles()).not.toContain("banner:Top");

    // hero banners lead sub-pages; they can never be put on the homepage
    const hero = await make("Hero", { type: "HERO", placement: "MOVIES", showOnHomepage: true });
    expect(hero.status).toBe(400);
  });
});
