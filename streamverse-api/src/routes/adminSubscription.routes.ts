import { Router } from "express";
import { z } from "zod";
import * as adminSubscriptionController from "../controllers/adminSubscription.controller";
import { validate } from "../middleware/validate.middleware";
import { adminSubscriptionListQuerySchema } from "../validators/billing.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });

/** Mounted at /api/v1/admin/subscriptions — inherits requireAuth + requireRole("ADMIN"). */
export const adminSubscriptionRouter = Router();
adminSubscriptionRouter.get("/", validate({ query: adminSubscriptionListQuerySchema }), asyncHandler(adminSubscriptionController.list));
adminSubscriptionRouter.get("/:id", validate({ params: idParam }), asyncHandler(adminSubscriptionController.getOne));
