import { Router } from "express";
import { z } from "zod";
import * as mediaAccessController from "../controllers/mediaAccess.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { buildAccessContext } from "../middleware/buildAccessContext";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const contentIdParam = z.object({ contentId: z.string().min(1) });

/**
 * Mounted at /api/v1/media (Section 53). Every route here requires a real session (Section 55) — there
 * is no anonymous case, unlike the public catalog reads from Phase 5.
 * Phase 8 adds `buildAccessContext` to provide the entitlement service with a fully populated context
 * (userId, role, country, accountStatus) without re-fetching per endpoint.
 */
export const mediaAccessRouter = Router();
mediaAccessRouter.use(requireAuth);
mediaAccessRouter.use(buildAccessContext);

mediaAccessRouter.post("/movies/:contentId/playback", validate({ params: contentIdParam }), asyncHandler(mediaAccessController.moviePlayback));
mediaAccessRouter.post("/audiobooks/:contentId/playback", validate({ params: contentIdParam }), asyncHandler(mediaAccessController.audiobookPlayback));
mediaAccessRouter.post("/ebooks/:contentId/access", validate({ params: contentIdParam }), asyncHandler(mediaAccessController.ebookAccess));
