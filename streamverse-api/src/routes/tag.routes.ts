import { Router } from "express";
import * as tagController from "../controllers/tag.controller";
import { validate } from "../middleware/validate.middleware";
import { createTagSchema } from "../validators/tag.validator";
import { asyncHandler } from "../utils/asyncHandler";

/** Section 27: minimal — most tags are created from content forms via findOrCreateTag, not here. */
export const tagRouter = Router();
tagRouter.get("/", asyncHandler(tagController.list));
tagRouter.post("/", validate({ body: createTagSchema }), asyncHandler(tagController.create));
