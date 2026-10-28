import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin, createUser as createRegularUser } from "../helpers/adminAuth";
import { setSetting } from "../../src/services/settings.service";

const db = prisma as unknown as {
  __reset: () => void;
  user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> };
};
const app = createApp();

beforeEach(() => db.__reset());

describe("maintenance mode guard", () => {
  it("returns 503 for regular user when maintenance is ON", async () => {
    // Turn on maintenance mode directly in the service
    await setSetting({ key: "maintenanceMode", value: true });

    const res = await request(app).get("/api/v1/movies");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("MAINTENANCE_MODE");
  });

  it("allows ADMIN through when maintenance is ON", async () => {
    const { accessToken } = await createAdmin(app, db as never);
    await setSetting({ key: "maintenanceMode", value: true });

    const res = await request(app).get("/api/v1/admin/dashboard/summary").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it("an administrator can still SIGN IN during maintenance (otherwise they could never turn it off)", async () => {
    const { accessToken } = await createAdmin(app, db as never);
    await setSetting({ key: "maintenanceMode", value: true });

    // signing in is never blocked...
    const bad = await request(app).post("/api/v1/auth/login").send({ email: "nobody@example.com", password: "wrong-password-123" });
    expect(bad.status).toBe(401); // refused for the credentials, not 503
    expect((await request(app).get("/api/v1/settings/public")).status).toBe(200); // the site learns it should show its maintenance screen
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`)).status).toBe(200);
    // ...while everything else stays closed to customers
    expect((await request(app).get("/api/v1/movies")).status).toBe(503);
    expect((await request(app).post("/api/v1/auth/register").send({ email: "new@example.com", password: "Str0ng-Passw0rd!", fullName: "New" })).status).toBe(503);
  });

  it("health endpoint is exempt from maintenance mode", async () => {
    await setSetting({ key: "maintenanceMode", value: true });
    const res = await request(app).get("/health");
    expect(res.status).not.toBe(503);
  });

  it("webhook endpoint is exempt from maintenance mode", async () => {
    await setSetting({ key: "maintenanceMode", value: true });
    // Stripe webhook — will fail signature verification (that's ok) but not 503
    const res = await request(app).post("/api/v1/webhooks/stripe").send({});
    expect(res.status).not.toBe(503);
  });

  it("allows normal access when maintenance is OFF", async () => {
    await setSetting({ key: "maintenanceMode", value: false });
    const res = await request(app).get("/api/v1/movies");
    expect(res.status).not.toBe(503);
  });
});

describe("registration disabled setting", () => {
  it("blocks new registrations when registrationEnabled = false", async () => {
    await setSetting({ key: "registrationEnabled", value: false });

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "new@x.com", password: "a-strong-passphrase", fullName: "New User" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REGISTRATION_DISABLED");
  });

  it("allows registration when registrationEnabled = true", async () => {
    await setSetting({ key: "registrationEnabled", value: true });

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "newuser2@x.com", password: "a-strong-passphrase", fullName: "New User" });

    expect(res.status).toBe(201);
  });

  it("allows registration when registrationEnabled is unset (default true)", async () => {
    // Don't set the setting — default is true
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "defaultuser@x.com", password: "a-strong-passphrase", fullName: "Default User" });

    expect(res.status).toBe(201);
  });
});

// Suppress unused import warning
void createRegularUser;
