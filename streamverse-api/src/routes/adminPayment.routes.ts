import { Router } from "express";
import { z } from "zod";
import * as adminPaymentController from "../controllers/adminPayment.controller";
import { billingWriteLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { adminPaymentListQuerySchema, refundSchema } from "../validators/billing.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });

/** Mounted at /api/v1/admin/payments — inherits requireAuth + requireRole("ADMIN"). */
export const adminPaymentRouter = Router();
adminPaymentRouter.get("/", validate({ query: adminPaymentListQuerySchema }), asyncHandler(adminPaymentController.list));
adminPaymentRouter.get("/summary", validate({ query: adminPaymentListQuerySchema }), asyncHandler(adminPaymentController.summary));
adminPaymentRouter.get("/:id", validate({ params: idParam }), asyncHandler(adminPaymentController.getOne));
adminPaymentRouter.post("/:id/refund", billingWriteLimiter(), validate({ params: idParam, body: refundSchema }), asyncHandler(adminPaymentController.refund));
