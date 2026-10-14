import { Router } from "express";
import { z } from "zod";
import * as adminPlanController from "../controllers/adminPlan.controller";
import { validate } from "../middleware/validate.middleware";
import { createPlanSchema, updatePlanSchema } from "../validators/plan.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });

/** Mounted at /api/v1/admin/plans — inherits requireAuth + requireRole("ADMIN"). */
export const adminPlanRouter = Router();
adminPlanRouter.get("/", asyncHandler(adminPlanController.list));
adminPlanRouter.post("/", validate({ body: createPlanSchema }), asyncHandler(adminPlanController.create));
adminPlanRouter.get("/:id", validate({ params: idParam }), asyncHandler(adminPlanController.getOne));
adminPlanRouter.put("/:id", validate({ params: idParam, body: updatePlanSchema }), asyncHandler(adminPlanController.update));
