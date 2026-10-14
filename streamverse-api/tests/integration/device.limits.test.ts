/**
 * Device limit integration tests.
 * Covers: unlimited devices, per-plan cap, reconnect deduplication, revoked-device exclusion,
 * and cross-user delete protection.
 *
 * Note: if the DB migration hasn't run yet the fake-Prisma tables cover all these operations
 * in memory — no real Postgres is needed.
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
import { createTestPlan } from "../helpers/billing";

const db = prisma as unknown as {
  __reset: () => void;
  subscription: { create: (a: unknown) => Promise<{ id: string }> };
  device: { update: (a: unknown) => Promise<unknown> };
};
const app = createApp();
beforeEach(() => db.__reset());

/** Creates a user and returns auth headers + userId. */
async function makeUser() {
  const { accessToken, userId } = await createUser(app);
  return { headers: { Authorization: `Bearer ${accessToken}` }, userId };
}

/**
 * Directly inserts a subscription row that links `userId` to `plan.id`, bypassing Stripe.
 * Enough for the service's `subscriptionRepository.findByUserId(userId)` to return a plan with limits.
 */
async function attachPlanToUser(userId: string, planId: string) {
  await (db.subscription as unknown as { create: (a: unknown) => Promise<unknown> }).create({
    data: {
      userId,
      planId,
      status: "ACTIVE",
      stripeSubscriptionId: `fake_sub_${Math.random().toString(36).slice(2)}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

/** POST /api/v1/me/devices/register with a fresh identifier. */
function registerDevice(headers: Record<string, string>, deviceIdentifier: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/me/devices/register")
    .set(headers)
    .send({ deviceIdentifier, deviceName: "Test Device", ...extra });
}

// ─────────────────────────────────────────────────────────────
describe("Device limits — maxDevices = null (unlimited)", () => {
  it("allows registering many different devices when the plan sets no cap", async () => {
    const plan = await createTestPlan({ maxDevices: null });
    const { headers, userId } = await makeUser();
    await attachPlanToUser(userId, plan.id);

    for (let i = 0; i < 5; i++) {
      const res = await registerDevice(headers, `device-${i}`);
      expect(res.status).toBe(200);
    }

    const list = await request(app).get("/api/v1/me/devices").set(headers);
    expect(list.body.data).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────
describe("Device limits — maxDevices = 1", () => {
  it("allows the first device but rejects the second with DEVICE_LIMIT_REACHED", async () => {
    const plan = await createTestPlan({ maxDevices: 1 });
    const { headers, userId } = await makeUser();
    await attachPlanToUser(userId, plan.id);

    const first = await registerDevice(headers, "device-first");
    expect(first.status).toBe(200);

    const second = await registerDevice(headers, "device-second");
    expect(second.status).toBe(403);
    expect(second.body.message).toBe("DEVICE_LIMIT_REACHED");
  });
});

// ─────────────────────────────────────────────────────────────
describe("Device reconnect deduplication", () => {
  it("re-registering the same identifier updates lastSeenAt but does NOT add a new device slot", async () => {
    const plan = await createTestPlan({ maxDevices: 1 });
    const { headers, userId } = await makeUser();
    await attachPlanToUser(userId, plan.id);

    // First registration — occupies the only slot
    const first = await registerDevice(headers, "my-tablet");
    expect(first.status).toBe(200);

    // Set the device's lastSeenAt to a clearly-old date so we can verify it updates
    const oldDate = new Date(Date.now() - 60_000);
    await db.device.update({
      where: { id: first.body.data.id },
      data: { lastSeenAt: oldDate },
    });

    // Re-register the SAME identifier — must succeed (not count as a new device)
    const second = await registerDevice(headers, "my-tablet");
    expect(second.status).toBe(200);

    // List must still show exactly one device
    const list = await request(app).get("/api/v1/me/devices").set(headers);
    expect(list.body.data).toHaveLength(1);

    // lastSeenAt must have been bumped forward by the re-registration
    const updatedSeenAt = new Date(list.body.data[0].lastSeenAt as string);
    expect(updatedSeenAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });
});

// ─────────────────────────────────────────────────────────────
describe("Revoked device exclusion", () => {
  it("a REVOKED device does not count toward the active-device limit", async () => {
    const plan = await createTestPlan({ maxDevices: 1 });
    const { headers, userId } = await makeUser();
    await attachPlanToUser(userId, plan.id);

    // Register one device and then immediately revoke it
    const first = await registerDevice(headers, "device-to-revoke");
    expect(first.status).toBe(200);
    await request(app).delete(`/api/v1/me/devices/${first.body.data.id as string}`).set(headers);

    // Verify the revoke happened (list is empty)
    const afterRevoke = await request(app).get("/api/v1/me/devices").set(headers);
    expect(afterRevoke.body.data).toHaveLength(0);

    // Registering a brand-new identifier should now succeed (slot was freed by revoke)
    const fresh = await registerDevice(headers, "device-fresh");
    expect(fresh.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────
describe("Cross-user isolation", () => {
  it("user A cannot delete user B's device", async () => {
    const { headers: headersA } = await makeUser();
    const { headers: headersB } = await makeUser();

    // User B registers a device
    const bDevice = await registerDevice(headersB, "b-device");
    expect(bDevice.status).toBe(200);
    const bDeviceId = bDevice.body.data.id as string;

    // User A tries to delete it — must get 404 (not found for this user)
    const del = await request(app).delete(`/api/v1/me/devices/${bDeviceId}`).set(headersA);
    expect(del.status).toBe(404);

    // B's device is still there
    const list = await request(app).get("/api/v1/me/devices").set(headersB);
    expect(list.body.data.map((d: { id: string }) => d.id)).toContain(bDeviceId);
  });
});
