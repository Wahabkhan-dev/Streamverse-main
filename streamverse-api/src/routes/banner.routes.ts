import { Router } from "express";
import { z } from "zod";
import * as bannerController from "../controllers/banner.controller";
import { validate } from "../middleware/validate.middleware";
import { bannerListQuerySchema, createBannerSchema, updateBannerSchema } from "../validators/banner.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });

export const bannerRouter = Router();
bannerRouter.get("/", validate({ query: bannerListQuerySchema }), asyncHandler(bannerController.list));
bannerRouter.post("/", validate({ body: createBannerSchema }), asyncHandler(bannerController.create));
bannerRouter.get("/:id", validate({ params: idParam }), asyncHandler(bannerController.getOne));
bannerRouter.put("/:id", validate({ params: idParam, body: updateBannerSchema }), asyncHandler(bannerController.update));
bannerRouter.delete("/:id", validate({ params: idParam }), asyncHandler(bannerController.remove));
