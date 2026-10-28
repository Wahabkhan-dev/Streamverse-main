import { Router } from "express";
import { z } from "zod";
import * as offlineController from "../controllers/offline.controller";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const params = z.object({ contentId: z.string().min(1) });
const query = z.object({ f: z.string().min(1).max(500), t: z.string().min(1) });

/**
 * Mounted at /api/v1/media/offline-file BEFORE the bearer-protected media router: a download is authorised by the signed,
 * short-lived token that POST /media/offline/:contentId/authorize issued, and every file id is checked against what the
 * title actually consists of.
 */
export const offlineDeliveryRouter = Router();
offlineDeliveryRouter.get("/:contentId", validate({ params, query }), asyncHandler(offlineController.file));
