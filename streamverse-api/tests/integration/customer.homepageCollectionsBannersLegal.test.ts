import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import * as bannerService from "../../src/services/banner.service";
import * as collectionService from "../../src/services/collection.service";
import * as homepageService from "../../src/services/homepage.service";
import * as legalService from "../../src/services/legal.service";
import { unpublishContent } from "../../src/services/contentStatus.service";
import { makePublishedMovie } from "../helpers/publishedContent";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

describe("Homepage (Section 12-14)", () => {
  it("returns only enabled sections, in display order, resolving manual and dynamic items", async () => {
    const { content: movieA } = await makePublishedMovie({ title: "Manual Pick", promo: { featured: true } });
    const manual = await homepageService.createSection({ key: "editors_picks", displayTitle: "Editors' Picks", enabled: true, displayOrder: 1, itemLimit: 12, type: "MANUAL" });
    await homepageService.addItem(manual.id, { contentId: movieA.id, displayOrder: 0 });
    await homepageService.createSection({ key: "featured", displayTitle: "Featured", enabled: true, displayOrder: 2, itemLimit: 12, type: "FEATURED" });
    await homepageService.createSection({ key: "disabled_section", displayTitle: "Hidden", enabled: false, displayOrder: 0, itemLimit: 12, type: "MANUAL" });

    const res = await request(app).get("/api/v1/homepage");
    expect(res.status).toBe(200);
    const keys = res.body.data.map((s: { key: string }) => s.key);
    expect(keys).toEqual(["editors_picks", "featured"]);
    const editors = res.body.data.find((s: { key: string }) => s.key === "editors_picks");
    expect(editors.items.map((i: { title: string }) => i.title)).toContain("Manual Pick");
    const featured = res.body.data.find((s: { key: string }) => s.key === "featured");
    expect(featured.items.map((i: { title: string }) => i.title)).toContain("Manual Pick");
  });

  it("filters out a manual item whose content is no longer customer-visible", async () => {
    const { content } = await makePublishedMovie({ title: "Will Be Unpublished" });
    const section = await homepageService.createSection({ key: "manual_section", displayTitle: "Manual", enabled: true, displayOrder: 0, itemLimit: 12, type: "MANUAL" });
    await homepageService.addItem(section.id, { contentId: content.id, displayOrder: 0 });

    await unpublishContent("MOVIE", content.id, { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined });

    const res = await request(app).get("/api/v1/homepage");
    const manual = res.body.data.find((s: { key: string }) => s.key === "manual_section");
    expect(manual.items).toHaveLength(0);
  });
});

describe("Collections (Section 17/18)", () => {
  it("lists only published collections, with unpublished-item filtered out and ordered items kept", async () => {
    const { content: visibleMovie } = await makePublishedMovie({ title: "In Collection" });
    const { content: hiddenMovie } = await makePublishedMovie({ title: "Removed From Visibility" });

    const published = await collectionService.createCollection({ name: "Staff Picks" });
    await collectionService.updateCollection(published.id, { status: "PUBLISHED" });
    await collectionService.addItem(published.id, { contentId: visibleMovie.id, displayOrder: 0 });
    await collectionService.addItem(published.id, { contentId: hiddenMovie.id, displayOrder: 1 });

    const draft = await collectionService.createCollection({ name: "Still Drafting" });
    void draft;

    await unpublishContent("MOVIE", hiddenMovie.id, { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined });

    const list = await request(app).get("/api/v1/collections");
    const names = list.body.data.map((c: { name: string }) => c.name);
    expect(names).toContain("Staff Picks");
    expect(names).not.toContain("Still Drafting");

    const detail = await request(app).get(`/api/v1/collections/${published.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.items.map((i: { title: string }) => i.title)).toEqual(["In Collection"]);
  });

  it("404s a draft collection's slug", async () => {
    const draft = await collectionService.createCollection({ name: "Hidden Collection" });
    const res = await request(app).get(`/api/v1/collections/${draft.slug}`);
    expect(res.status).toBe(404);
  });
});

describe("Banners (Section 15/16)", () => {
  it("lists active banners and drops one whose linked content is no longer visible", async () => {
    const { content } = await makePublishedMovie({ title: "Banner Linked Movie" });
    await bannerService.createBanner({ type: "HERO", title: "Big Hero Banner", priority: 1, active: true, linkedContentId: content.id });
    const { content: toHide } = await makePublishedMovie({ title: "Soon Hidden Banner Target" });
    await bannerService.createBanner({ type: "NORMAL", title: "Doomed Banner", priority: 1, active: true, linkedContentId: toHide.id });

    await unpublishContent("MOVIE", toHide.id, { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined });

    const res = await request(app).get("/api/v1/banners");
    const titles = res.body.data.map((b: { title: string }) => b.title);
    expect(titles).toContain("Big Hero Banner");
    expect(titles).not.toContain("Doomed Banner");
  });
});

describe("Customer legal reads (Section 53/54)", () => {
  it("returns the published version, never a draft, and 404s when nothing is published", async () => {
    await legalService.ensureDocument("PRIVACY_POLICY");
    const before = await request(app).get("/api/v1/legal/privacy-policy");
    expect(before.status).toBe(404);

    await legalService.saveDraft("PRIVACY_POLICY", { title: "Privacy Policy", content: "Draft content v1", version: "1" });
    const stillDraft = await request(app).get("/api/v1/legal/privacy-policy");
    expect(stillDraft.status).toBe(404);

    await legalService.publishDraft("PRIVACY_POLICY");
    const published = await request(app).get("/api/v1/legal/privacy-policy");
    expect(published.status).toBe(200);
    expect(published.body.data.content).toBe("Draft content v1");

    await legalService.saveDraft("PRIVACY_POLICY", { title: "Privacy Policy", content: "Draft content v2 (unpublished)", version: "2" });
    const stillOldPublished = await request(app).get("/api/v1/legal/privacy-policy");
    expect(stillOldPublished.body.data.content).toBe("Draft content v1");
  });
});
