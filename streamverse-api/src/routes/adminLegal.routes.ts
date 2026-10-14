import { Router } from "express";
import { z } from "zod";
import * as adminLegalController from "../controllers/adminLegal.controller";
import { validate } from "../middleware/validate.middleware";
import { legalDocTypeSchema, legalVersionMetadataSchema } from "../validators/legal.validator";
import { asyncHandler } from "../utils/asyncHandler";

const typeParam = z.object({ type: legalDocTypeSchema });

/** Mounted at /api/v1/admin/legal. Section 71: only the three fixed types are ever accepted, nothing arbitrary. */
export const adminLegalRouter = Router();
adminLegalRouter.get("/", asyncHandler(adminLegalController.list));
adminLegalRouter.get("/:type", validate({ params: typeParam }), asyncHandler(adminLegalController.getOne));
adminLegalRouter.get("/:type/preview", validate({ params: typeParam }), asyncHandler(adminLegalController.preview));
adminLegalRouter.get("/:type/versions", validate({ params: typeParam }), asyncHandler(adminLegalController.versions));
adminLegalRouter.post("/:type/draft", validate({ params: typeParam, body: legalVersionMetadataSchema }), asyncHandler(adminLegalController.saveDraft));
adminLegalRouter.put("/:type/draft", validate({ params: typeParam, body: legalVersionMetadataSchema }), asyncHandler(adminLegalController.saveDraft));
adminLegalRouter.post("/:type/publish", validate({ params: typeParam }), asyncHandler(adminLegalController.publish));
