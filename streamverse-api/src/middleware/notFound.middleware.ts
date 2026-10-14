import type { RequestHandler } from "express";
import { NotFoundError } from "../utils/errors";

/** Unknown routes get JSON, never HTML. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
};
