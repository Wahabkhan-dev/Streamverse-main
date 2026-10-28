import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import { describeError } from "@/lib/errors";

describe("describeError: plain words for every kind of failure", () => {
  it("a network failure says to check the connection", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toMatchObject({ title: "No connection", retryable: true });
  });
  it("uses the server's own explanation when it says something specific", () => {
    expect(describeError(new ApiError(409, "CONFLICT", "This genre is used by 3 titles."))).toMatchObject({ detail: "This genre is used by 3 titles.", retryable: false });
    expect(describeError(new ApiError(400, "VALIDATION", "A title is required."))).toMatchObject({ detail: "A title is required." });
  });
  it("never shows a bare status line or code to a person", () => {
    const d = describeError(new ApiError(500, "UNKNOWN", "Request failed: 500 Internal Server Error")).detail;
    expect(d).not.toMatch(/Request failed|UNKNOWN|500/);
    expect(describeError(new ApiError(404, "NOT_FOUND", "Not Found")).detail).toMatch(/could not be found/);
  });
  it("tells a person what to do about limits and outages", () => {
    expect(describeError(new ApiError(429, "RATE_LIMITED", "Too many requests")).detail).toMatch(/wait/);
    expect(describeError(new ApiError(503, "SERVICE_UNAVAILABLE", "StreamVerse is busy or temporarily unavailable. Please try again in a moment.")).retryable).toBe(true);
    expect(describeError(new ApiError(403, "FORBIDDEN", "Forbidden")).detail).toMatch(/permission/);
  });
  it("copes with anything else that was thrown", () => {
    expect(describeError("boom").detail).toMatch(/try again/i);
  });
});
