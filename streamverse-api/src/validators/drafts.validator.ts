import { z } from "zod";
import { listQuery } from "../utils/pagination";

export const draftListQuerySchema = listQuery(["updatedAt", "createdAt", "title"] as const, "updatedAt").extend({
  type: z.enum(["MOVIE", "EBOOK", "AUDIOBOOK"]).optional(),
  search: z.string().trim().max(200).optional(),
});
