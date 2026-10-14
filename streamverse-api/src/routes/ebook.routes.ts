import { Router } from "express";
import { z } from "zod";
import * as ebookController from "../controllers/ebook.controller";
import { validate } from "../middleware/validate.middleware";
import { scheduleSchema, statusActionSchema } from "../validators/content.validator";
import { createEbookSchema, ebookEditionSchema, ebookListQuerySchema, updateEbookEditionSchema, updateEbookSchema } from "../validators/ebook.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });
const editionParams = z.object({ id: z.string().min(1), editionId: z.string().min(1) });

export const ebookRouter = Router();

ebookRouter.get("/", validate({ query: ebookListQuerySchema }), asyncHandler(ebookController.list));
ebookRouter.post("/", validate({ body: createEbookSchema }), asyncHandler(ebookController.create));
ebookRouter.get("/:id", validate({ params: idParam }), asyncHandler(ebookController.getOne));
ebookRouter.put("/:id", validate({ params: idParam, body: updateEbookSchema }), asyncHandler(ebookController.update));
ebookRouter.patch("/:id", validate({ params: idParam, body: updateEbookSchema }), asyncHandler(ebookController.update));
ebookRouter.delete("/:id", validate({ params: idParam, body: statusActionSchema }), asyncHandler(ebookController.remove));

ebookRouter.post("/:id/publish", validate({ params: idParam, body: statusActionSchema }), asyncHandler(ebookController.publish));
ebookRouter.post("/:id/unpublish", validate({ params: idParam, body: statusActionSchema }), asyncHandler(ebookController.unpublish));
ebookRouter.post("/:id/archive", validate({ params: idParam, body: statusActionSchema }), asyncHandler(ebookController.archive));
ebookRouter.post("/:id/schedule", validate({ params: idParam, body: scheduleSchema }), asyncHandler(ebookController.schedule));
ebookRouter.post("/:id/cancel-schedule", validate({ params: idParam, body: statusActionSchema }), asyncHandler(ebookController.cancelSchedule));

ebookRouter.post("/:id/editions", validate({ params: idParam, body: ebookEditionSchema }), asyncHandler(ebookController.addEdition));
ebookRouter.put("/:id/editions/:editionId", validate({ params: editionParams, body: updateEbookEditionSchema }), asyncHandler(ebookController.updateEdition));
ebookRouter.delete("/:id/editions/:editionId", validate({ params: editionParams }), asyncHandler(ebookController.deleteEdition));
