/**
 * Phase 8 — Territory restriction tests.
 * WORLDWIDE: no restriction.
 * INCLUDE: only listed countries pass.
 * EXCLUDE: listed countries are blocked.
 * Unknown country (no country on user): deny when mode != WORLDWIDE.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createUser } from "../helpers/adminAuth";
import { makePublishedMovie } from "../helpers/publishedContent";

const db = prisma as unknown as {
  __reset: () => void;
  user: { update: (a: unknown) => Promise<unknown> };
  content: { update: (a: unknown) => Promise<unknown> };
  contentTerritory: { create: (a: unknown) => Promise<unknown> };
};
const app = createApp();
beforeEach(() => db.__reset());

async function userWithCountry(country: string | null) {
  const { accessToken, userId } = await createUser(app);
  if (country) {
    await db.user.update({ where: { id: userId }, data: { country } });
  }
  return { headers: { Authorization: `Bearer ${accessToken}` }, userId };
}

async function movieWithTerritory(territoryMode: string, codes: string[]) {
  const { content } = await makePublishedMovie();
  await db.content.update({ where: { id: content.id }, data: { territoryMode } });
  for (const code of codes) {
    await db.contentTerritory.create({ data: { contentId: content.id, countryCode: code } });
  }
  return content;
}

describe("WORLDWIDE territory mode", () => {
  it("passes for any user regardless of country", async () => {
    const content = await movieWithTerritory("WORLDWIDE", []);
    const { headers } = await userWithCountry("US");
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.body.data.access.canConsume).toBe(true);
  });

  it("passes for user with no country", async () => {
    const content = await movieWithTerritory("WORLDWIDE", []);
    const { headers } = await userWithCountry(null);
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.body.data.access.canConsume).toBe(true);
  });
});

describe("INCLUDE territory mode", () => {
  it("allows a user whose country is in the include list", async () => {
    const content = await movieWithTerritory("INCLUDE", ["US", "GB"]);
    const { headers } = await userWithCountry("US");
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.body.data.access.canConsume).toBe(true);
  });

  it("blocks a user whose country is NOT in the include list", async () => {
    const content = await movieWithTerritory("INCLUDE", ["US", "GB"]);
    const { headers } = await userWithCountry("DE");
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "REGION_RESTRICTED" });
  });

  it("blocks a user with no country set (unknown country → deny)", async () => {
    const content = await movieWithTerritory("INCLUDE", ["US"]);
    const { headers } = await userWithCountry(null);
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "REGION_RESTRICTED" });
  });
});

describe("EXCLUDE territory mode", () => {
  it("blocks a user whose country is in the exclude list", async () => {
    const content = await movieWithTerritory("EXCLUDE", ["CN", "RU"]);
    const { headers } = await userWithCountry("CN");
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "REGION_RESTRICTED" });
  });

  it("allows a user whose country is NOT in the exclude list", async () => {
    const content = await movieWithTerritory("EXCLUDE", ["CN", "RU"]);
    const { headers } = await userWithCountry("US");
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.body.data.access.canConsume).toBe(true);
  });

  it("blocks a user with no country set (unknown country → deny)", async () => {
    const content = await movieWithTerritory("EXCLUDE", ["CN"]);
    const { headers } = await userWithCountry(null);
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "REGION_RESTRICTED" });
  });
});
