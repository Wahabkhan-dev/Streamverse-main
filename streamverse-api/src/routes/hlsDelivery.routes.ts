import { Router } from "express";
import { z } from "zod";
import * as hlsController from "../controllers/hlsDelivery.controller";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

// validate() replaces req.params with the parsed result and drops unknown keys, so the wildcard must be declared.
const params = z.object({ contentId: z.string().min(1), 0: z.string().default("") });
const query = z.object({ t: z.string().min(1).optional() });

/**
 * Mounted at /api/v1/media/hls BEFORE the authenticated media router. These endpoints are authorised by the signed,
 * short-lived playback token in `?t=` (issued by POST /media/movies/:id/playback) rather than a bearer header, because
 * a media element / HLS client following playlist URLs cannot be relied on to attach one.
 */
export const hlsDeliveryRouter = Router();
hlsDeliveryRouter.get("/:contentId/*", validate({ params, query }), asyncHandler(hlsController.serve));
