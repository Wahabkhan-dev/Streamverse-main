import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { ensureDocument, getDocument, publishDraft, saveDraft } from "../../src/services/legal.service";

const db = prisma as unknown as { __reset: () => void };
beforeEach(() => db.__reset());

describe("legal document versioning", () => {
  it("a new draft does not touch the published version", async () => {
    await ensureDocument("PRIVACY_POLICY");
    await saveDraft("PRIVACY_POLICY", { title: "Privacy Policy", content: "<p>v1 published text</p>", version: "1.0" });
    await publishDraft("PRIVACY_POLICY");

    await saveDraft("PRIVACY_POLICY", { title: "Privacy Policy", content: "<p>v1.1 draft in progress</p>", version: "1.1" });

    const doc = await getDocument("PRIVACY_POLICY");
    expect(doc!.currentPublishedVersion!.content).toBe("<p>v1 published text</p>");
    expect(doc!.currentPublishedVersion!.version).toBe("1.0");
    expect(doc!.currentDraftVersion!.content).toBe("<p>v1.1 draft in progress</p>");
    expect(doc!.currentDraftVersion!.status).toBe("DRAFT");
  });

  it("publishing makes the draft the published version, and clears the draft pointer", async () => {
    await ensureDocument("TERMS_AND_CONDITIONS");
    await saveDraft("TERMS_AND_CONDITIONS", { title: "Terms & Conditions", content: "<p>final text</p>", version: "2.0" });
    await publishDraft("TERMS_AND_CONDITIONS");

    const doc = await getDocument("TERMS_AND_CONDITIONS");
    expect(doc!.currentDraftVersionId).toBeNull();
    expect(doc!.currentPublishedVersion!.content).toBe("<p>final text</p>");
    expect(doc!.currentPublishedVersion!.status).toBe("PUBLISHED");
    expect(doc!.currentPublishedVersion!.publishedAt).toBeTruthy();
  });

  it("saving a draft twice edits the same draft row in place rather than piling up orphans", async () => {
    await ensureDocument("REFUND_POLICY");
    const first = await saveDraft("REFUND_POLICY", { title: "Refund Policy", content: "<p>first</p>", version: "0.1" });
    const second = await saveDraft("REFUND_POLICY", { title: "Refund Policy", content: "<p>second</p>", version: "0.2" });
    expect(second.id).toBe(first.id);
    const doc = await getDocument("REFUND_POLICY");
    expect(doc!.currentDraftVersion!.content).toBe("<p>second</p>");
  });

  it("a previously-published version record is kept after a newer one replaces it as current", async () => {
    await ensureDocument("PRIVACY_POLICY");
    await saveDraft("PRIVACY_POLICY", { title: "Privacy Policy", content: "<p>v1</p>", version: "1.0" });
    const v1 = await publishDraft("PRIVACY_POLICY");

    await saveDraft("PRIVACY_POLICY", { title: "Privacy Policy", content: "<p>v2</p>", version: "2.0" });
    await publishDraft("PRIVACY_POLICY");

    const versions = await (prisma as unknown as { legalDocumentVersion: { findMany: (a: unknown) => Promise<{ id: string }[]> } }).legalDocumentVersion.findMany({ where: { legalDocumentId: v1.legalDocumentId } });
    expect(versions.map((v) => v.id)).toContain(v1.id);
    expect(versions).toHaveLength(2);

    const doc = await getDocument("PRIVACY_POLICY");
    expect(doc!.currentPublishedVersion!.version).toBe("2.0");
  });

  it("the three fixed document types each get their own document, idempotently", async () => {
    await ensureDocument("PRIVACY_POLICY");
    await ensureDocument("PRIVACY_POLICY"); // second call: no duplicate
    const doc = await getDocument("PRIVACY_POLICY");
    const all = await (prisma as unknown as { legalDocument: { findMany: () => Promise<unknown[]> } }).legalDocument.findMany();
    expect(all).toHaveLength(1);
    expect(doc!.slug).toBe("privacy-policy");
  });
});
