import { Router } from "express";
import { z } from "zod";
import * as collectionController from "../controllers/collection.controller";
import { validate } from "../middleware/validate.middleware";
import { addCollectionItemSchema, collectionListQuerySchema, createCollectionSchema, reorderCollectionItemsSchema, updateCollectionSchema } from "../validators/collection.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });
const itemParams = z.object({ id: z.string().min(1), contentId: z.string().min(1) });

export const collectionRouter = Router();
collectionRouter.get("/", validate({ query: collectionListQuerySchema }), asyncHandler(collectionController.list));
collectionRouter.post("/", validate({ body: createCollectionSchema }), asyncHandler(collectionController.create));
collectionRouter.get("/:id", validate({ params: idParam }), asyncHandler(collectionController.getOne));
collectionRouter.put("/:id", validate({ params: idParam, body: updateCollectionSchema }), asyncHandler(collectionController.update));
collectionRouter.delete("/:id", validate({ params: idParam }), asyncHandler(collectionController.remove));

collectionRouter.post("/:id/items", validate({ params: idParam, body: addCollectionItemSchema }), asyncHandler(collectionController.addItem));
collectionRouter.put("/:id/items/reorder", validate({ params: idParam, body: reorderCollectionItemsSchema }), asyncHandler(collectionController.reorderItems));
collectionRouter.delete("/:id/items/:contentId", validate({ params: itemParams }), asyncHandler(collectionController.removeItem));
