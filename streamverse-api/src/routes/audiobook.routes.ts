import { Router } from "express";
import { z } from "zod";
import * as audiobookController from "../controllers/audiobook.controller";
import { validate } from "../middleware/validate.middleware";
import { reorderSchema, scheduleSchema, statusActionSchema } from "../validators/content.validator";
import {
  audiobookChapterSchema,
  audiobookEditionSchema,
  audiobookListQuerySchema,
  createAudiobookSchema,
  updateAudiobookChapterSchema,
  updateAudiobookEditionSchema,
  updateAudiobookSchema,
} from "../validators/audiobook.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });
const editionParams = z.object({ id: z.string().min(1), editionId: z.string().min(1) });
const chapterParams = z.object({ id: z.string().min(1), chapterId: z.string().min(1) });

export const audiobookRouter = Router();

audiobookRouter.get("/", validate({ query: audiobookListQuerySchema }), asyncHandler(audiobookController.list));
audiobookRouter.post("/", validate({ body: createAudiobookSchema }), asyncHandler(audiobookController.create));
audiobookRouter.get("/:id", validate({ params: idParam }), asyncHandler(audiobookController.getOne));
audiobookRouter.put("/:id", validate({ params: idParam, body: updateAudiobookSchema }), asyncHandler(audiobookController.update));
audiobookRouter.patch("/:id", validate({ params: idParam, body: updateAudiobookSchema }), asyncHandler(audiobookController.update));
audiobookRouter.delete("/:id", validate({ params: idParam, body: statusActionSchema }), asyncHandler(audiobookController.remove));

audiobookRouter.post("/:id/publish", validate({ params: idParam, body: statusActionSchema }), asyncHandler(audiobookController.publish));
audiobookRouter.post("/:id/unpublish", validate({ params: idParam, body: statusActionSchema }), asyncHandler(audiobookController.unpublish));
audiobookRouter.post("/:id/archive", validate({ params: idParam, body: statusActionSchema }), asyncHandler(audiobookController.archive));
audiobookRouter.post("/:id/schedule", validate({ params: idParam, body: scheduleSchema }), asyncHandler(audiobookController.schedule));
audiobookRouter.post("/:id/cancel-schedule", validate({ params: idParam, body: statusActionSchema }), asyncHandler(audiobookController.cancelSchedule));

audiobookRouter.post("/:id/editions", validate({ params: idParam, body: audiobookEditionSchema }), asyncHandler(audiobookController.addEdition));
audiobookRouter.put("/:id/editions/:editionId", validate({ params: editionParams, body: updateAudiobookEditionSchema }), asyncHandler(audiobookController.updateEdition));
audiobookRouter.delete("/:id/editions/:editionId", validate({ params: editionParams }), asyncHandler(audiobookController.deleteEdition));

audiobookRouter.post("/:id/chapters", validate({ params: idParam, body: audiobookChapterSchema }), asyncHandler(audiobookController.addChapter));
audiobookRouter.put("/:id/chapters/reorder", validate({ params: idParam, body: reorderSchema }), asyncHandler(audiobookController.reorderChapters));
audiobookRouter.put("/:id/chapters/:chapterId", validate({ params: chapterParams, body: updateAudiobookChapterSchema }), asyncHandler(audiobookController.updateChapter));
audiobookRouter.delete("/:id/chapters/:chapterId", validate({ params: chapterParams }), asyncHandler(audiobookController.deleteChapter));
