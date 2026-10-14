import { z } from "zod";
import type { Pagination } from "./apiResponse";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Query schema for list endpoints. Sorting is limited to a whitelist, so query input is never used
 * directly as an ORDER BY / orderBy key.
 */
export function listQuery<const S extends readonly [string, ...string[]]>(sortable: S, defaultSort: S[number]) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    sortBy: z.enum(sortable).default(defaultSort),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
}

export const toSkipTake = (page: number, limit: number) => ({ skip: (page - 1) * limit, take: limit });

export const buildPagination = (total: number, page: number, limit: number): Pagination => ({ page, limit, total, totalPages: Math.ceil(total / limit) });
