import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { createSlugFromTitle, ensureUniqueSlug, uniqueSlugFor } from "../../src/services/slug.service";

const db = prisma as unknown as { __reset: () => void; content: { create: (a: { data: Record<string, unknown> }) => Promise<unknown> } };
beforeEach(() => db.__reset());

describe("createSlugFromTitle", () => {
  it("lowercases and dashes a normal title", () => {
    expect(createSlugFromTitle("The Last Horizon")).toBe("the-last-horizon");
  });
  it("strips punctuation and collapses whitespace/special characters", () => {
    expect(createSlugFromTitle("Zenith: Run! (Director's Cut)")).toBe("zenith-run-director-s-cut");
    expect(createSlugFromTitle("  Spaced   Out  ")).toBe("spaced-out");
  });
  it("folds accents instead of dropping the whole word", () => {
    expect(createSlugFromTitle("Café Noir")).toBe("cafe-noir");
  });
  it("never produces an empty slug", () => {
    expect(createSlugFromTitle("!!!")).toBe("untitled");
    expect(createSlugFromTitle("")).toBe("untitled");
  });
});

async function makeContentWithSlug(slug: string) {
  await (prisma as unknown as { content: { create: (a: { data: Record<string, unknown> } ) => Promise<unknown> } }).content.create({ data: { contentCode: `MOV-${slug}`, type: "MOVIE", title: slug, slug } });
}

describe("ensureUniqueSlug / uniqueSlugFor", () => {
  it("returns the base slug when it is free", async () => {
    expect(await ensureUniqueSlug("the-last-horizon")).toBe("the-last-horizon");
  });

  it("appends -2, -3, ... when the slug is taken", async () => {
    await makeContentWithSlug("the-last-horizon");
    expect(await ensureUniqueSlug("the-last-horizon")).toBe("the-last-horizon-2");
    await makeContentWithSlug("the-last-horizon-2");
    expect(await ensureUniqueSlug("the-last-horizon")).toBe("the-last-horizon-3");
  });

  it("uniqueSlugFor derives from the title when no manual slug is given", async () => {
    expect(await uniqueSlugFor({ title: "The Last Horizon" })).toBe("the-last-horizon");
  });

  it("a manual slug is normalized the same way a generated one is", async () => {
    expect(await uniqueSlugFor({ title: "Ignored", manualSlug: "  Custom Slug!! " })).toBe("custom-slug");
  });

  it("excludeId lets a title keep its own current slug during a rename check", async () => {
    await makeContentWithSlug("keep-me");
    // without excludeId, "keep-me" looks taken
    expect(await ensureUniqueSlug("keep-me")).toBe("keep-me-2");
    // with excludeId naming no real row, same result (excludeId only skips a real match)
    expect(await ensureUniqueSlug("keep-me", "someone-elses-id")).toBe("keep-me-2");
  });
});
