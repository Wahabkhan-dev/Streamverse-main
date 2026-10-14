import { Router } from "express";
import * as homepageCustomerController from "../controllers/homepageCustomer.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const homepageCustomerRouter = Router();
homepageCustomerRouter.get("/", asyncHandler(homepageCustomerController.get));
