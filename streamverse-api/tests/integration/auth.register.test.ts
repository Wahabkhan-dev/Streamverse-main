import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { getCookie } from "../helpers/cookies";

const db = prisma as unknown as { __reset: () => void; user: { all: () => { email: string; role: string; passwordHash?: string }[] } };
const app = createApp();

beforeEach(() => db.__reset());

const body = { email: "Alex@Example.com", password: "a-strong-passphrase", fullName: "Alex Morgan" };

describe("POST /api/v1/auth/register", () => {
  it("creates a USER, ACTIVE account and returns it without the password hash", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: "alex@example.com", fullName: "Alex Morgan", role: "user", status: "ACTIVE", emailVerified: false });
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|a-strong-passphrase/);
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(getCookie(res, "sv_refresh_token")).toBeTruthy();
  });

  it("normalizes the email (trim + lowercase) before storing and checking duplicates", async () => {
    await request(app).post("/api/v1/auth/register").send({ ...body, email: "  Alex@Example.com  " });
    const res = await request(app).post("/api/v1/auth/register").send({ ...body, email: "alex@example.com" });
    expect(res.status).toBe(409);
  });

  it("rejects a duplicate email with a safe, specific message — not a raw database error", async () => {
    await request(app).post("/api/v1/auth/register").send(body);
    const res = await request(app).post("/api/v1/auth/register").send(body);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, message: "An account with this email already exists." });
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|constraint|P2002/i);
  });

  it("cannot be used to create an ADMIN by injecting a role in the request body", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ ...body, role: "ADMIN", status: "ACTIVE" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("user");
    expect(db.user.all().every((u) => u.role === "USER")).toBe(true);
  });

  it("rejects an invalid email with field-level validation errors", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ ...body, email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: "body.email" })]));
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ ...body, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: "body.password" })]));
  });
});
