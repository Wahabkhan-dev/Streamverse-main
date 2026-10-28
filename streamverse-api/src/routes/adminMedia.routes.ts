import { Router } from "express";
import { z } from "zod";
import * as adminMediaController from "../controllers/adminMedia.controller";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

import * as libraryController from "../controllers/mediaLibrary.controller";
import { bulkDeleteSchema, libraryListQuerySchema, mediaIdParamSchema, reconcileSchema, replaceMediaSchema, updateMediaMetadataSchema } from "../validators/mediaLibrary.validator";

const assetIdParam = z.object({ assetId: z.string().min(1) });
const contentIdParam = z.object({ contentId: z.string().min(1) });
const attachParams = z.object({ contentId: z.string().min(1), assetId: z.string().min(1) });

/** Mounted at /api/v1/admin/media — inherits requireAuth + requireRole("ADMIN"). */
export const adminMediaRouter = Router();

// Media Library (static paths first so they are never read as an :assetId)
adminMediaRouter.get("/", validate({ query: libraryListQuerySchema }), asyncHandler(libraryController.list));
adminMediaRouter.get("/stats", asyncHandler(libraryController.stats));
adminMediaRouter.post("/reconcile", validate({ body: reconcileSchema }), asyncHandler(libraryController.reconcile));
adminMediaRouter.post("/bulk-delete", validate({ body: bulkDeleteSchema }), asyncHandler(libraryController.bulkDelete));
adminMediaRouter.get("/:assetId", validate({ params: mediaIdParamSchema }), asyncHandler(libraryController.detail));
adminMediaRouter.patch("/:assetId", validate({ params: mediaIdParamSchema, body: updateMediaMetadataSchema }), asyncHandler(libraryController.update));
adminMediaRouter.post("/:assetId/replace", validate({ params: mediaIdParamSchema, body: replaceMediaSchema }), asyncHandler(libraryController.replace));

adminMediaRouter.delete("/:assetId", validate({ params: assetIdParam }), asyncHandler(libraryController.remove));
adminMediaRouter.post("/:assetId/retry-processing", validate({ params: assetIdParam }), asyncHandler(adminMediaController.retryProcessing));

/** Mounted at /api/v1/admin/content — Section 66/43. */
export const adminContentMediaRouter = Router();
adminContentMediaRouter.get("/:contentId/media", validate({ params: contentIdParam }), asyncHandler(adminMediaController.listForContent));
adminContentMediaRouter.post("/:contentId/media/:assetId/attach", validate({ params: attachParams }), asyncHandler(adminMediaController.checkAttachable));
