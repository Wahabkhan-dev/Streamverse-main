/**
 * Phase 8 — Age restriction access tests.
 * Age-restricted content requires a verified age via POST /me/age-verification.
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
  content: { update: (a: unknown) => Promise<unknown> };
};
const app = createApp();
beforeEach(() => db.__reset());

async function createUserAndAuth() {
  const { accessToken, userId } = await createUser(app);
  return { headers: { Authorization: `Bearer ${accessToken}` }, userId };
}

async function ageRestrictedMovie(minimumAge = 18) {
  // ageRestricted/minimumAge are nested under `age` in the content schema
  const { content } = await makePublishedMovie({ age: { ageRestricted: true, minimumAge } });
  return content;
}

describe("Age-restricted content", () => {
  it("denies access with AGE_NOT_VERIFIED when user has no age record", async () => {
    const content = await ageRestrictedMovie(18);
    const { headers } = await createUserAndAuth();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "AGE_NOT_VERIFIED" });
  });

  it("denies access with AGE_RESTRICTED when user is below minimumAge", async () => {
    const content = await ageRestrictedMovie(18);
    const { headers } = await createUserAndAuth();
    // Submit DOB for a 16-year-old (born 10 years after today's year - 26 to make them 16)
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 16);
    const dobStr = dob.toISOString().split("T")[0];
    await request(app).post("/api/v1/me/age-verification").set(headers).send({ dateOfBirth: dobStr });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "AGE_RESTRICTED" });
  });

  it("allows access when user meets the minimum age", async () => {
    const content = await ageRestrictedMovie(18);
    const { headers } = await createUserAndAuth();
    // Submit DOB for a 20-year-old
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 20);
    const dobStr = dob.toISOString().split("T")[0];
    await request(app).post("/api/v1/me/age-verification").set(headers).send({ dateOfBirth: dobStr });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });

  it("allows access for the exact minimum age (birthday today → just old enough)", async () => {
    const content = await ageRestrictedMovie(18);
    const { headers } = await createUserAndAuth();
    // DOB exactly 18 years ago TODAY (birthday today → age = 18)
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 18);
    const dobStr = dob.toISOString().split("T")[0];
    await request(app).post("/api/v1/me/age-verification").set(headers).send({ dateOfBirth: dobStr });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });
});

describe("POST /me/age-verification", () => {
  it("accepts a valid date of birth", async () => {
    const { headers } = await createUserAndAuth();
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 25);
    const dobStr = dob.toISOString().split("T")[0];
    const res = await request(app).post("/api/v1/me/age-verification").set(headers).send({ dateOfBirth: dobStr });
    expect(res.status).toBe(201);
    expect(res.body.data.ageConfirmed).toBe(true);
    expect(res.body.data.method).toBe("SELF_DECLARED");
  });

  it("rejects a future date of birth", async () => {
    const { headers } = await createUserAndAuth();
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app)
      .post("/api/v1/me/age-verification")
      .set(headers)
      .send({ dateOfBirth: future.toISOString().split("T")[0] });
    expect(res.status).toBe(400);
  });

  it("rejects a date of birth more than 150 years ago", async () => {
    const { headers } = await createUserAndAuth();
    const res = await request(app)
      .post("/api/v1/me/age-verification")
      .set(headers)
      .send({ dateOfBirth: "1800-01-01" });
    expect(res.status).toBe(400);
  });

  it("never returns the dateOfBirth field", async () => {
    const { headers } = await createUserAndAuth();
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 25);
    const dobStr = dob.toISOString().split("T")[0];
    await request(app).post("/api/v1/me/age-verification").set(headers).send({ dateOfBirth: dobStr });
    const res = await request(app).get("/api/v1/me/age-verification").set(headers);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("dateOfBirth");
  });

  it("GET /me/age-verification returns ageConfirmed=false when no record exists", async () => {
    const { headers } = await createUserAndAuth();
    const res = await request(app).get("/api/v1/me/age-verification").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.ageConfirmed).toBe(false);
  });
});
