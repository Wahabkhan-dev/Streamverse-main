import { Router } from "express";
import * as newsletterController from "../controllers/newsletter.controller";
import { newsletterLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { newsletterSubscribeSchema } from "../validators/newsletter.validator";

/** Footer "Stay in the Loop" sign-up: public. */
export const newsletterRouter = Router();

newsletterRouter.post("/subscribe", newsletterLimiter(), validate({ body: newsletterSubscribeSchema }), asyncHandler(newsletterController.subscribe));
