import { Router } from "express";
import * as genreCustomerController from "../controllers/genreCustomer.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const genreCustomerRouter = Router();
genreCustomerRouter.get("/", asyncHandler(genreCustomerController.list));
