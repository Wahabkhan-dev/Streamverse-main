import { Router } from "express";
import * as homepageCustomerController from "../controllers/homepageCustomer.controller";
import { validate } from "../middleware/validate.middleware";
import { homepageQuerySchema } from "../validators/homepage.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const homepageCustomerRouter = Router();
homepageCustomerRouter.get("/", validate({ query: homepageQuerySchema }), asyncHandler(homepageCustomerController.get));
