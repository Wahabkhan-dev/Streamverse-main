import { z } from "zod";
import { listQuery } from "../utils/pagination";

const bannerFields = {
  type: z.enum(["HERO", "NORMAL", "LATEST_RELEASE", "PROMOTIONAL"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  desktopAssetId: z.string().min(1).optional(),
  mobileAssetId: z.string().min(1).optional(),
  linkedContentId: z.string().min(1).optional(),
  buttonText: z.string().max(60).optional(),
  priority: z.number().int().min(1).max(1000).default(1),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  active: z.boolean().default(true),
};

/** Section 38: startsAt < endsAt when both exist. */
export const createBannerSchema = z
  .object(bannerFields)
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, { message: "startsAt must be before endsAt", path: ["endsAt"] });
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

export const updateBannerSchema = z
  .object({ ...bannerFields, expectedUpdatedAt: z.coerce.date().optional() })
  .partial()
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, { message: "startsAt must be before endsAt", path: ["endsAt"] });
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const bannerListQuerySchema = listQuery(["priority", "createdAt", "updatedAt", "startsAt"] as const, "priority").extend({
  type: z.enum(["HERO", "NORMAL", "LATEST_RELEASE", "PROMOTIONAL"]).optional(),
  active: z.coerce.boolean().optional(),
});
