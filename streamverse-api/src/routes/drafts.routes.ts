import { Router } from "express";
import * as draftsController from "../controllers/drafts.controller";
import { validate } from "../middleware/validate.middleware";
import { draftListQuerySchema } from "../validators/drafts.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const draftsRouter = Router();
draftsRouter.get("/", validate({ query: draftListQuerySchema }), asyncHandler(draftsController.list));
