import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";

const app = createApp();
let n = 0;
const freshCredentials = () => ({ email: `alex-${++n}@example.com`, password: "a-strong-passphrase", fullName: "Alex Morgan" });

beforeEach(() => (prisma as unknown as { __reset: () => void }).__reset());

async function register() {
  const res = await request(app).post("/api/v1/auth/register").send(freshCredentials());
  return res.body.data.accessToken as string;
}

describe("GET /api/v1/me/profile", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/me/profile")).status).toBe(401);
  });

  it("returns the authenticated user's own profile, without the password hash", async () => {
    const accessToken = await register();
    const res = await request(app).get("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fullName: "Alex Morgan", role: "user" });
    expect(res.body.data).not.toHaveProperty("passwordHash");
  });
});

describe("PATCH /api/v1/me/profile", () => {
  it("updates allowed preference fields", async () => {
    const accessToken = await register();
    const res = await request(app)
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ fullName: "Alexandra Morgan", country: "ca", preferredLanguage: "French", videoQuality: "4K", audiobookSpeed: 1.25 });
    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe("Alexandra Morgan");
    expect(res.body.data.preferences).toMatchObject({ country: "CA", preferredLanguage: "French", videoQuality: "4K", audiobookSpeed: 1.25 });
  });

  it("keeps the chosen colour and a small uploaded photo, and refuses anything else as a photo", async () => {
    const accessToken = await register();
    const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
    const res = await request(app).patch("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`).send({ accentColor: 3, avatarUrl: photo });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ accentColor: 3, avatarUrl: photo });
    const again = await request(app).get("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`);
    expect(again.body.data).toMatchObject({ accentColor: 3, avatarUrl: photo });
    const bad = (body: object) => request(app).patch("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`).send(body);
    expect((await bad({ accentColor: 9 })).status).toBe(400);
    expect((await bad({ avatarUrl: "data:text/html;base64,AAAA" })).status).toBe(400);
    expect((await bad({ avatarUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await bad({ avatarUrl: `data:image/jpeg;base64,${"A".repeat(160_000)}` })).status).toBe(400);
    expect((await bad({ accentColor: null, avatarUrl: null })).status).toBe(200);
  });

  it("ignores an attempt to change role through the generic profile update", async () => {
    const accessToken = await register();
    const res = await request(app).patch("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`).send({ fullName: "Still Alex", role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("user");
  });

  it("ignores an attempt to change status through the generic profile update", async () => {
    const accessToken = await register();
    const res = await request(app).patch("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`).send({ fullName: "Still Alex", status: "SUSPENDED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACTIVE");
    // the account can still do authenticated things — the injected status never took effect
    expect((await request(app).get("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`)).status).toBe(200);
  });

  it("ignores an attempt to inject passwordHash or change the email", async () => {
    const accessToken = await register();
    const res = await request(app)
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ fullName: "Still Alex", passwordHash: "hacked", email: "new-email@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty("passwordHash");
    const profile = await request(app).get("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`);
    expect(profile.body.data.email).not.toBe("new-email@example.com");
  });

  it("requires authentication", async () => {
    expect((await request(app).patch("/api/v1/me/profile").send({ fullName: "Nope" })).status).toBe(401);
  });
});
