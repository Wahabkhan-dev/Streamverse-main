import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createGenre } from "../../src/services/genre.service";
import { createMovie } from "../../src/services/movie.service";
import { createMovieSchema } from "../../src/validators/movie.validator";
import { makePublishedAudiobook, makePublishedEbook, makePublishedMovie } from "../helpers/publishedContent";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

describe("customer search (Section 20/85)", () => {
  it("finds a movie by title", async () => {
    await makePublishedMovie({ title: "Zenith Run" });
    const res = await request(app).get("/api/v1/search").query({ q: "Zenith" });
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { title: string }) => d.title)).toContain("Zenith Run");
  });

  it("finds a movie by an actor's name (cast)", async () => {
    const genre = await createGenre({ name: "Action" });
    const { content, movie } = await makePublishedMovie({ title: "Starbound", genreIds: [genre.id], cast: [{ name: "Ines Varga", characterName: "Commander" }] });
    void movie;
    const res = await request(app).get("/api/v1/search").query({ q: "Ines Varga" });
    expect(res.body.data.map((d: { title: string }) => d.title)).toContain("Starbound");
    void content;
  });

  it("finds an eBook by author, and an audiobook by narrator", async () => {
    await makePublishedEbook({ title: "The Original Book", ebook: { author: "Odile Maren" } });
    await makePublishedAudiobook({ title: "The Narrated Book", audiobook: { narrator: "Kemal Ross" } });
    const byAuthor = await request(app).get("/api/v1/search").query({ q: "Odile Maren" });
    expect(byAuthor.body.data.map((d: { title: string }) => d.title)).toContain("The Original Book");
    const byNarrator = await request(app).get("/api/v1/search").query({ q: "Kemal Ross" });
    expect(byNarrator.body.data.map((d: { title: string }) => d.title)).toContain("The Narrated Book");
  });

  it("finds content by genre name", async () => {
    const genre = await createGenre({ name: "Noir Mystery" });
    await makePublishedMovie({ title: "Shadow City", genreIds: [genre.id] });
    const res = await request(app).get("/api/v1/search").query({ q: "Noir Mystery" });
    expect(res.body.data.map((d: { title: string }) => d.title)).toContain("Shadow City");
  });

  it("filters by type", async () => {
    await makePublishedMovie({ title: "Common Word Movie" });
    await makePublishedEbook({ title: "Common Word Book" });
    const res = await request(app).get("/api/v1/search").query({ q: "Common Word", type: "MOVIES" });
    const titles = res.body.data.map((d: { title: string }) => d.title);
    expect(titles).toContain("Common Word Movie");
    expect(titles).not.toContain("Common Word Book");
  });

  it("paginates", async () => {
    for (let i = 0; i < 3; i++) await makePublishedMovie({ title: `Paginated Title ${i}` });
    const res = await request(app).get("/api/v1/search").query({ q: "Paginated Title", page: 1, limit: 2 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(3);
  });

  it("excludes draft content", async () => {
    await createMovie(createMovieSchema.parse({ title: "Secret Draft Title" }));
    const res = await request(app).get("/api/v1/search").query({ q: "Secret Draft" });
    expect(res.body.data).toHaveLength(0);
  });

  it("returns a PEOPLE result grouped with their titles", async () => {
    await makePublishedMovie({ title: "People Search Movie", cast: [{ name: "Mara Okafor", characterName: "Lead" }] });
    const res = await request(app).get("/api/v1/search").query({ q: "Mara Okafor", type: "PEOPLE" });
    expect(res.body.data[0]).toMatchObject({ name: "Mara Okafor", role: "Actor" });
    expect(res.body.data[0].titles[0].title).toBe("People Search Movie");
  });

  it("enforces a maximum query length", async () => {
    const res = await request(app).get("/api/v1/search").query({ q: "a".repeat(200) });
    expect(res.status).toBe(400);
  });

  it("suggestions return a small, lightweight set", async () => {
    await makePublishedMovie({ title: "Suggested Movie" });
    const res = await request(app).get("/api/v1/search/suggestions").query({ q: "Suggested" });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(8);
    expect(res.body.data[0]).toHaveProperty("label");
  });
});
