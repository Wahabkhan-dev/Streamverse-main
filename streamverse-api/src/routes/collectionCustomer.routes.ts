import { Router } from "express";
import * as collectionCustomerController from "../controllers/collectionCustomer.controller";
import { validate } from "../middleware/validate.middleware";
import { collectionCustomerListQuerySchema } from "../validators/collectionCustomer.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const collectionCustomerRouter = Router();
collectionCustomerRouter.get("/", validate({ query: collectionCustomerListQuerySchema }), asyncHandler(collectionCustomerController.list));
collectionCustomerRouter.get("/:slug", asyncHandler(collectionCustomerController.getOne));
