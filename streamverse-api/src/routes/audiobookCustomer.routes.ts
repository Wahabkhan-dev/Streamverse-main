import { Router } from "express";
import * as audiobookCustomerController from "../controllers/audiobookCustomer.controller";
import { optionalAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { catalogListQuerySchema } from "../validators/catalog.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const audiobookCustomerRouter = Router();
audiobookCustomerRouter.get("/", validate({ query: catalogListQuerySchema }), asyncHandler(audiobookCustomerController.list));
audiobookCustomerRouter.get("/:slug", optionalAuth, asyncHandler(audiobookCustomerController.getOne));
