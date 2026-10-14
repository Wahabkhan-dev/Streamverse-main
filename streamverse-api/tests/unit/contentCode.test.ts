import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { formatContentCode, nextContentCode } from "../../src/services/contentCode.service";

beforeEach(() => (prisma as unknown as { __reset: () => void }).__reset());

describe("content codes", () => {
  it("formats MOV-000001 / EBK-000001 / AUD-000001", () => {
    expect(formatContentCode("MOVIE", 1)).toBe("MOV-000001");
    expect(formatContentCode("EBOOK", 42)).toBe("EBK-000042");
    expect(formatContentCode("AUDIOBOOK", 1_000_000)).toBe("AUD-1000000");
  });

  it("the first movie code is MOV-000001", async () => {
    expect(await nextContentCode("MOVIE")).toBe("MOV-000001");
  });

  it("issues sequential codes for the same type", async () => {
    expect(await nextContentCode("MOVIE")).toBe("MOV-000001");
    expect(await nextContentCode("MOVIE")).toBe("MOV-000002");
    expect(await nextContentCode("MOVIE")).toBe("MOV-000003");
  });

  it("each content type has its own independent sequence", async () => {
    await nextContentCode("MOVIE");
    await nextContentCode("MOVIE");
    expect(await nextContentCode("EBOOK")).toBe("EBK-000001");
    expect(await nextContentCode("AUDIOBOOK")).toBe("AUD-000001");
    expect(await nextContentCode("MOVIE")).toBe("MOV-000003");
  });

  it("a deleted title's number is never handed out again (the counter only goes up)", async () => {
    const a = await nextContentCode("MOVIE"); // MOV-000001
    const b = await nextContentCode("MOVIE"); // MOV-000002
    void a;
    // simulate "deleting" the content that held MOV-000002 — nothing resets the sequence for that
    const c = await nextContentCode("MOVIE");
    expect(c).toBe("MOV-000003");
    expect(c).not.toBe(b);
  });

  it("concurrent requests for the same type never collide", async () => {
    const codes = await Promise.all(Array.from({ length: 25 }, () => nextContentCode("MOVIE")));
    expect(new Set(codes).size).toBe(25);
    expect(codes.sort()).toEqual(Array.from({ length: 25 }, (_, i) => formatContentCode("MOVIE", i + 1)).sort());
  });
});
