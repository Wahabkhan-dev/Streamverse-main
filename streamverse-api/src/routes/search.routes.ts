import { Router } from "express";
import * as searchController from "../controllers/search.controller";
import { searchLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { searchQuerySchema, suggestionsQuerySchema } from "../validators/search.validator";
import { asyncHandler } from "../utils/asyncHandler";

/** Public (Section 4). Rate limited (Section 21) — the policy already exists from Phase 2, just unused until now. */
export const searchRouter = Router();
searchRouter.get("/suggestions", searchLimiter(), validate({ query: suggestionsQuerySchema }), asyncHandler(searchController.suggestions));
searchRouter.get("/", searchLimiter(), validate({ query: searchQuerySchema }), asyncHandler(searchController.search));
