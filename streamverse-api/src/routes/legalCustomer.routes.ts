import { Router } from "express";
import * as legalCustomerController from "../controllers/legalCustomer.controller";
import { asyncHandler } from "../utils/asyncHandler";

/** Public (Section 53) — the published version only; see legalCustomer.controller.ts. */
export const legalCustomerRouter = Router();
legalCustomerRouter.get("/privacy-policy", asyncHandler(legalCustomerController.privacyPolicy));
legalCustomerRouter.get("/terms-and-conditions", asyncHandler(legalCustomerController.termsAndConditions));
legalCustomerRouter.get("/refund-policy", asyncHandler(legalCustomerController.refundPolicy));
