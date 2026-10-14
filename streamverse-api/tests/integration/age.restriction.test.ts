/**
 * Age-restriction tests — two paths exercised:
 *
 * 1. `contentAccess.service.evaluateAccess()` — the in-process function used by catalog/listing routes.
 * 2. The playback endpoint (`/api/v1/media/movies/:id/playback`) — the entitlement / mediaAccess path.
 *
 * The existing `access.ageRestrictions.test.ts` already covers the HTTP playback path in detail.
 * This file adds direct service-level tests for evaluateAccess and verifies the "no restriction" case.
 *
 * Note: these tests use the in-memory fake-Prisma and do NOT require a running PostgreSQL server.
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
import { evaluateAccess } from "../../src/services/contentAccess.service";
import type { AccessibleContent, AccessUser } from "../../src/services/contentAccess.service";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();
beforeEach(() => db.__reset());

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A minimal published content object with age restriction enabled. */
function ageRestrictedContent(minimumAge = 18): AccessibleContent {
  return {
    status: "PUBLISHED",
    deletedAt: null,
    visibility: "PUBLIC",
    ageRestricted: true,
    minimumAge,
    territoryMode: "WORLDWIDE",
    availableFrom: null,
    availableUntil: null,
  };
}

/** A minimal published content object with NO age restriction. */
function unrestricted(): AccessibleContent {
  return {
    status: "PUBLISHED",
    deletedAt: null,
    visibility: "PUBLIC",
    ageRestricted: false,
    minimumAge: null,
    territoryMode: "WORLDWIDE",
    availableFrom: null,
    availableUntil: null,
  };
}

/** Builds an AccessUser with an explicit `ageVerified` flag. */
function userWithAge(ageVerified: boolean): AccessUser {
  return { country: null, hasActiveSubscription: true, ageVerified };
}

// ─────────────────────────────────────────────────────────────────────────────
// contentAccess.service — evaluateAccess (catalog / listing path)
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateAccess — contentAccess.service (catalog path)", () => {
  it("blocks with AGE_RESTRICTED when user has ageVerified = false and content is age-restricted", () => {
    const result = evaluateAccess(ageRestrictedContent(18), userWithAge(false), []);
    expect(result.canConsume).toBe(false);
    expect(result.reason).toBe("AGE_RESTRICTED");
  });

  it("allows access when user has ageVerified = true and meets the minimum age", () => {
    const result = evaluateAccess(ageRestrictedContent(18), userWithAge(true), []);
    expect(result.canConsume).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("blocks anonymous user (undefined) with AGE_RESTRICTED when content is age-restricted", () => {
    const result = evaluateAccess(ageRestrictedContent(18), undefined, []);
    // Anonymous user has no age verification — must be blocked
    expect(result.canConsume).toBe(false);
    // Unauthenticated users hit SUBSCRIPTION_REQUIRED before AGE_RESTRICTED when content is PUBLIC
    // (visibility PUBLIC means subscription check passes); age check runs after subscription check.
    // evaluateAccess for PUBLIC content with no subscription check needed → reaches age check.
    // With undefined user, ageVerified is falsy → AGE_RESTRICTED.
    expect(result.reason).toBe("AGE_RESTRICTED");
  });

  it("allows access to unrestricted content regardless of age-verification status", () => {
    const withAge = evaluateAccess(unrestricted(), userWithAge(true), []);
    const withoutAge = evaluateAccess(unrestricted(), userWithAge(false), []);
    expect(withAge.canConsume).toBe(true);
    expect(withoutAge.canConsume).toBe(true);
  });

  it("canViewMetadata is true for age-restricted content even when canConsume is false", () => {
    // Customers should still see title/thumbnail; they just can't play it.
    const result = evaluateAccess(ageRestrictedContent(18), userWithAge(false), []);
    expect(result.canViewMetadata).toBe(true);
    expect(result.canConsume).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Playback endpoint — entitlement / mediaAccess path
// ─────────────────────────────────────────────────────────────────────────────

describe("Playback endpoint — age restriction (entitlement path)", () => {
  it("returns AGE_NOT_VERIFIED when user has no age-verification record", async () => {
    const content = await (async () => {
      const { content } = await makePublishedMovie({ age: { ageRestricted: true, minimumAge: 18 } });
      return content;
    })();
    const { accessToken } = await createUser(app);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "AGE_NOT_VERIFIED" });
  });

  it("returns AGE_RESTRICTED when user is below the minimum age", async () => {
    const content = await (async () => {
      const { content } = await makePublishedMovie({ age: { ageRestricted: true, minimumAge: 18 } });
      return content;
    })();
    const { accessToken } = await createUser(app);
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Submit a DOB that makes the user 16 years old
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 16);
    await request(app).post("/api/v1/me/age-verification").set(headers).send({ dateOfBirth: dob.toISOString().split("T")[0] });

    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "AGE_RESTRICTED" });
  });

  it("grants access when user is old enough (20 years old, minimum 18)", async () => {
    const content = await (async () => {
      const { content } = await makePublishedMovie({ age: { ageRestricted: true, minimumAge: 18 } });
      return content;
    })();
    const { accessToken } = await createUser(app);
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Submit a DOB that makes the user 20 years old
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 20);
    await request(app).post("/api/v1/me/age-verification").set(headers).send({ dateOfBirth: dob.toISOString().split("T")[0] });

    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });

  it("content with no age restriction is always allowed regardless of age verification", async () => {
    // Published movie with NO age restriction
    const { content } = await makePublishedMovie(); // no age override = ageRestricted: false
    const { accessToken } = await createUser(app);
    const headers = { Authorization: `Bearer ${accessToken}` };

    // User has no age verification record
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    // reason must be absent when access is granted
    expect(res.body.data.access.reason).toBeUndefined();
  });
});
