import { describe, expect, it } from "vitest";
import { AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../../src/utils/errors";
import { buildPagination, listQuery, toSkipTake } from "../../src/utils/pagination";

describe("pagination", () => {
  const q = listQuery(["createdAt", "title"] as const, "createdAt");

  it("applies defaults, coerces strings and caps the limit", () => {
    expect(q.parse({})).toEqual({ page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc" });
    expect(q.parse({ page: "3", limit: "50" })).toMatchObject({ page: 3, limit: 50 });
    expect(q.safeParse({ limit: "101" }).success).toBe(false);
    expect(q.safeParse({ page: "0" }).success).toBe(false);
  });

  it("only allows whitelisted sort fields", () => {
    expect(q.safeParse({ sortBy: "passwordHash" }).success).toBe(false);
    expect(q.safeParse({ sortBy: "title; DROP TABLE users" }).success).toBe(false);
    expect(q.parse({ sortBy: "title", sortOrder: "asc" })).toMatchObject({ sortBy: "title", sortOrder: "asc" });
  });

  it("computes skip/take and totals", () => {
    expect(toSkipTake(3, 20)).toEqual({ skip: 40, take: 20 });
    expect(buildPagination(100, 1, 20)).toEqual({ page: 1, limit: 20, total: 100, totalPages: 5 });
    expect(buildPagination(101, 1, 20).totalPages).toBe(6);
    expect(buildPagination(0, 1, 20).totalPages).toBe(0);
  });
});

describe("custom errors", () => {
  it("carry the right status and code", () => {
    const list = [new ValidationError(), new UnauthorizedError(), new ForbiddenError(), new NotFoundError(), new ConflictError()];
    expect(list.map((e) => e.statusCode)).toEqual([400, 401, 403, 404, 409]);
    const e = new ValidationError([{ path: "body.email", message: "bad" }]);
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("VALIDATION_FAILED");
    expect(e.errors).toHaveLength(1);
    expect(e.name).toBe("ValidationError");
  });
});
