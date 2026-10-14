import { Router } from "express";
import * as planController from "../controllers/plan.controller";
import { asyncHandler } from "../utils/asyncHandler";

/** Mounted at /api/v1/plans — public (Section 12): a pricing page is shown before login. */
export const planRouter = Router();
planRouter.get("/", asyncHandler(planController.listCustomerPlans));
