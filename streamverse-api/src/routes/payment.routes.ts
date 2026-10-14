import { Router } from "express";
import * as paymentController from "../controllers/payment.controller";
import { validate } from "../middleware/validate.middleware";
import { billingHistoryQuerySchema } from "../validators/billing.validator";
import { asyncHandler } from "../utils/asyncHandler";

/** Mounted at /api/v1/me/payments — requireAuth is already applied by userRouter. */
export const paymentRouter = Router();
paymentRouter.get("/", validate({ query: billingHistoryQuerySchema }), asyncHandler(paymentController.listMyPayments));
