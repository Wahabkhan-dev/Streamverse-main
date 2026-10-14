import { Router } from "express";
import { z } from "zod";
import * as movieController from "../controllers/movie.controller";
import { validate } from "../middleware/validate.middleware";
import { scheduleSchema, statusActionSchema } from "../validators/content.validator";
import { createMovieSchema, movieListQuerySchema, updateMovieSchema } from "../validators/movie.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });

/** Mounted at /api/v1/admin/movies — the parent admin router already applies requireAuth + requireRole("ADMIN"). */
export const movieRouter = Router();

movieRouter.get("/", validate({ query: movieListQuerySchema }), asyncHandler(movieController.list));
movieRouter.post("/", validate({ body: createMovieSchema }), asyncHandler(movieController.create));
movieRouter.get("/:id", validate({ params: idParam }), asyncHandler(movieController.getOne));
movieRouter.put("/:id", validate({ params: idParam, body: updateMovieSchema }), asyncHandler(movieController.update));
movieRouter.patch("/:id", validate({ params: idParam, body: updateMovieSchema }), asyncHandler(movieController.update));
movieRouter.delete("/:id", validate({ params: idParam, body: statusActionSchema }), asyncHandler(movieController.remove));

movieRouter.post("/:id/publish", validate({ params: idParam, body: statusActionSchema }), asyncHandler(movieController.publish));
movieRouter.post("/:id/unpublish", validate({ params: idParam, body: statusActionSchema }), asyncHandler(movieController.unpublish));
movieRouter.post("/:id/archive", validate({ params: idParam, body: statusActionSchema }), asyncHandler(movieController.archive));
movieRouter.post("/:id/schedule", validate({ params: idParam, body: scheduleSchema }), asyncHandler(movieController.schedule));
movieRouter.post("/:id/cancel-schedule", validate({ params: idParam, body: statusActionSchema }), asyncHandler(movieController.cancelSchedule));
