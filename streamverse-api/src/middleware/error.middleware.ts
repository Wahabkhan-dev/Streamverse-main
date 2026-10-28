import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { ERROR_CODES } from "../constants/errors";
import { logger } from "../config/logger";
import { Sentry } from "../config/sentry";
import { sendError } from "../utils/apiResponse";
import { AppError, ConflictError, NotFoundError } from "../utils/errors";

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

/** Turns anything thrown into one safe, consistent response. Raw database errors and stacks never leave the server. */
function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const parser = err as BodyParserError;
  if (parser?.type === "entity.too.large") return new AppError("Request body is too large", 413, ERROR_CODES.PAYLOAD_TOO_LARGE);
  if (parser?.type === "entity.parse.failed" || err instanceof SyntaxError) return new AppError("Request body is not valid JSON", 400, ERROR_CODES.BAD_REQUEST);

  // The database could not be reached or is overloaded: say so (and that retrying is fine), never a bare "Something went wrong".
  if (err instanceof Prisma.PrismaClientInitializationError || (err instanceof Prisma.PrismaClientKnownRequestError && DB_UNAVAILABLE.has(err.code)))
    return new AppError("StreamVerse is busy or temporarily unavailable. Please try again in a moment.", 503, ERROR_CODES.SERVICE_UNAVAILABLE);

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return new ConflictError("A record with these values already exists");
    if (err.code === "P2025") return new NotFoundError();
    if (err.code === "P2003") return new ConflictError("This item is still used somewhere else, or something it points to no longer exists. Refresh and try again.");
    if (err.code === "P2000") return new AppError("One of the values is too long.", 400, ERROR_CODES.BAD_REQUEST);
    if (err.code === "P2034") return new ConflictError("Someone else changed this at the same moment. Please try again.");
  }
  return new AppError("Something went wrong", 500, ERROR_CODES.INTERNAL);
}

/** Prisma's "cannot reach the database / connection pool exhausted / timed out" codes. */
const DB_UNAVAILABLE = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

// Express identifies error middleware by its four arguments.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalize(err);
  const log = { requestId: req.id, err: appError.statusCode >= 500 ? err : undefined, statusCode: appError.statusCode, code: appError.code };
  if (appError.statusCode >= 500) logger.error(log, "request failed");
  else logger.debug(log, appError.message);

  // Report 5xx errors to Sentry when enabled — never logs secrets from the request body
  if (appError.statusCode >= 500 && process.env["SENTRY_DSN"]) {
    Sentry.withScope((scope) => {
      scope.setTag("requestId", req.id);
      scope.setTag("route", req.path);
      scope.setTag("method", req.method);
      scope.setTag("statusCode", String(appError.statusCode));
      if (req.auth?.userId) scope.setUser({ id: req.auth.userId });
      Sentry.captureException(err);
    });
  }

  if (res.headersSent) return;
  if (appError.statusCode === 503) res.set("Retry-After", "5");
  sendError(res, appError.statusCode, appError.message, appError.errors, { code: appError.code, requestId: req.id });
};
