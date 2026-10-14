import { Router } from "express";
import * as subscriptionController from "../controllers/subscription.controller";
import { billingWriteLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { changePlanSchema, checkoutSchema } from "../validators/billing.validator";
import { asyncHandler } from "../utils/asyncHandler";

/** Mounted at /api/v1/me/subscription — requireAuth is already applied by userRouter. */
export const subscriptionRouter = Router();
subscriptionRouter.get("/", asyncHandler(subscriptionController.getMySubscription));
subscriptionRouter.post("/checkout", billingWriteLimiter(), validate({ body: checkoutSchema }), asyncHandler(subscriptionController.checkout));
subscriptionRouter.post("/cancel", billingWriteLimiter(), asyncHandler(subscriptionController.cancel));
subscriptionRouter.post("/resume", billingWriteLimiter(), asyncHandler(subscriptionController.resume));
subscriptionRouter.post("/change-plan", billingWriteLimiter(), validate({ body: changePlanSchema }), asyncHandler(subscriptionController.changePlan));
