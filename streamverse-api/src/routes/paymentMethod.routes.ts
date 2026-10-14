import { Router } from "express";
import { z } from "zod";
import * as paymentMethodController from "../controllers/paymentMethod.controller";
import { billingWriteLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });

/** Mounted at /api/v1/me/payment-methods — requireAuth is already applied by userRouter. */
export const paymentMethodRouter = Router();
paymentMethodRouter.post("/setup", billingWriteLimiter(), asyncHandler(paymentMethodController.setup));
paymentMethodRouter.get("/", asyncHandler(paymentMethodController.list));
paymentMethodRouter.post("/:id/default", billingWriteLimiter(), validate({ params: idParam }), asyncHandler(paymentMethodController.setDefault));
paymentMethodRouter.delete("/:id", billingWriteLimiter(), validate({ params: idParam }), asyncHandler(paymentMethodController.remove));
