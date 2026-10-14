import { Router } from "express";
import { z } from "zod";
import * as adminBillingController from "../controllers/adminBilling.controller";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const userIdParam = z.object({ userId: z.string().min(1) });

/** Mounted at /api/v1/admin/billing — inherits requireAuth + requireRole("ADMIN"). Internal/admin only (Section 89). */
export const adminBillingRouter = Router();
adminBillingRouter.post("/reconcile/:userId", validate({ params: userIdParam }), asyncHandler(adminBillingController.reconcile));
