import { Router } from "express";
import { z } from "zod";
import * as adminMediaController from "../controllers/adminMedia.controller";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const assetIdParam = z.object({ assetId: z.string().min(1) });
const contentIdParam = z.object({ contentId: z.string().min(1) });
const attachParams = z.object({ contentId: z.string().min(1), assetId: z.string().min(1) });

/** Mounted at /api/v1/admin/media — inherits requireAuth + requireRole("ADMIN"). */
export const adminMediaRouter = Router();
adminMediaRouter.delete("/:assetId", validate({ params: assetIdParam }), asyncHandler(adminMediaController.remove));
adminMediaRouter.post("/:assetId/retry-processing", validate({ params: assetIdParam }), asyncHandler(adminMediaController.retryProcessing));

/** Mounted at /api/v1/admin/content — Section 66/43. */
export const adminContentMediaRouter = Router();
adminContentMediaRouter.get("/:contentId/media", validate({ params: contentIdParam }), asyncHandler(adminMediaController.listForContent));
adminContentMediaRouter.post("/:contentId/media/:assetId/attach", validate({ params: attachParams }), asyncHandler(adminMediaController.checkAttachable));
