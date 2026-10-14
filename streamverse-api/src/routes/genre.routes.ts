import { Router } from "express";
import { z } from "zod";
import * as genreController from "../controllers/genre.controller";
import { validate } from "../middleware/validate.middleware";
import { createGenreSchema, updateGenreSchema } from "../validators/genre.validator";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });

export const genreRouter = Router();
genreRouter.get("/", asyncHandler(genreController.list));
genreRouter.post("/", validate({ body: createGenreSchema }), asyncHandler(genreController.create));
genreRouter.put("/:id", validate({ params: idParam, body: updateGenreSchema }), asyncHandler(genreController.update));
genreRouter.delete("/:id", validate({ params: idParam }), asyncHandler(genreController.remove));
