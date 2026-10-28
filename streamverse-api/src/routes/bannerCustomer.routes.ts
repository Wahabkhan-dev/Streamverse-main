import { Router } from "express";
import { z } from "zod";
import * as bannerCustomerController from "../controllers/bannerCustomer.controller";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const bannerCustomerRouter = Router();
bannerCustomerRouter.get("/", validate({ query: z.object({ type: z.enum(["HERO", "NORMAL", "LATEST_RELEASE", "PROMOTIONAL"]).optional(), placement: z.enum(["MOVIES", "EBOOKS", "AUDIOBOOKS"]).optional() }) }), asyncHandler(bannerCustomerController.list));
