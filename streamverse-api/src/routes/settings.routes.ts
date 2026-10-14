import { Router } from "express";
import { z } from "zod";
import * as settingsController from "../controllers/settings.controller";
import { validate } from "../middleware/validate.middleware";
import { settingsBatchSchema, settingValueBodySchema } from "../validators/settings.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const settingsRouter = Router();
settingsRouter.get("/", asyncHandler(settingsController.list));
settingsRouter.put("/", validate({ body: settingsBatchSchema }), asyncHandler(settingsController.updateBatch));
settingsRouter.put("/:key", validate({ params: z.object({ key: z.string() }), body: settingValueBodySchema }), asyncHandler(settingsController.update));
