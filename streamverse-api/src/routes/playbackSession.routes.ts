import { Router } from "express";
import { z } from "zod";
import * as playbackSessionController from "../controllers/playbackSession.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const playbackSessionRouter = Router();
playbackSessionRouter.use(requireAuth);

const idParam = z.object({ id: z.string().min(1) });

playbackSessionRouter.post("/:id/heartbeat", validate({ params: idParam }), asyncHandler(playbackSessionController.heartbeat));
playbackSessionRouter.post("/:id/end", validate({ params: idParam }), asyncHandler(playbackSessionController.end));
