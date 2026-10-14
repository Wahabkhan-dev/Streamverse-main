import { Router } from "express";
import * as languageController from "../controllers/language.controller";
import { validate } from "../middleware/validate.middleware";
import { createLanguageSchema } from "../validators/language.validator";
import { asyncHandler } from "../utils/asyncHandler";

/** Section 28: languages are primarily seeded; this just lets Admin see all of them (including inactive) and add a rare new one. */
export const languageRouter = Router();
languageRouter.get("/", asyncHandler(languageController.list));
languageRouter.post("/", validate({ body: createLanguageSchema }), asyncHandler(languageController.create));
