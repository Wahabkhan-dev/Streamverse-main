import { Router } from "express";
import * as movieCustomerController from "../controllers/movieCustomer.controller";
import { optionalAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { catalogListQuerySchema } from "../validators/catalog.validator";
import { asyncHandler } from "../utils/asyncHandler";

/** Public (Section 4) — browsing needs no login; `optionalAuth` personalizes access when a token is sent. */
export const movieCustomerRouter = Router();
movieCustomerRouter.get("/", validate({ query: catalogListQuerySchema }), asyncHandler(movieCustomerController.list));
movieCustomerRouter.get("/:slug", optionalAuth, asyncHandler(movieCustomerController.getOne));
