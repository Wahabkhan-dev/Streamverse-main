import { Router } from "express";
import { z } from "zod";
import * as homepageController from "../controllers/homepage.controller";
import { validate } from "../middleware/validate.middleware";
import { reorderSchema } from "../validators/content.validator";
import { addHomepageItemSchema, createHomepageSectionSchema, reorderHomepageItemsSchema, updateHomepageSectionSchema } from "../validators/homepage.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });
const itemParams = z.object({ id: z.string().min(1), contentId: z.string().min(1) });

/** Mounted at /api/v1/admin/homepage/sections. */
export const homepageRouter = Router();
homepageRouter.get("/", asyncHandler(homepageController.list));
homepageRouter.post("/", validate({ body: createHomepageSectionSchema }), asyncHandler(homepageController.create));
homepageRouter.put("/reorder", validate({ body: reorderSchema }), asyncHandler(homepageController.reorderSections));
homepageRouter.put("/:id", validate({ params: idParam, body: updateHomepageSectionSchema }), asyncHandler(homepageController.update));
homepageRouter.delete("/:id", validate({ params: idParam }), asyncHandler(homepageController.remove));

homepageRouter.get("/:id/items", validate({ params: idParam }), asyncHandler(homepageController.getItems));
homepageRouter.post("/:id/items", validate({ params: idParam, body: addHomepageItemSchema }), asyncHandler(homepageController.addItem));
homepageRouter.put("/:id/items/reorder", validate({ params: idParam, body: reorderHomepageItemsSchema }), asyncHandler(homepageController.reorderItems));
homepageRouter.delete("/:id/items/:contentId", validate({ params: itemParams }), asyncHandler(homepageController.removeItem));
