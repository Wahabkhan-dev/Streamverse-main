import { z } from "zod";

export const historyListQuerySchema = z.object({
  type: z.enum(["WATCHED", "READ", "LISTENED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
