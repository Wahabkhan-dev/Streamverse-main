import { Router } from "express";
import * as ebookCustomerController from "../controllers/ebookCustomer.controller";
import { optionalAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { catalogListQuerySchema } from "../validators/catalog.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const ebookCustomerRouter = Router();
ebookCustomerRouter.get("/", validate({ query: catalogListQuerySchema }), asyncHandler(ebookCustomerController.list));
ebookCustomerRouter.get("/:slug", optionalAuth, asyncHandler(ebookCustomerController.getOne));
