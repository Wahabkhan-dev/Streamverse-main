import { ERROR_CODES } from "../../constants/errors";
import { AppError, NotFoundError } from "../../utils/errors";

/** True when storage answered "no such object" (S3/R2 or the local dev adapter), as opposed to failing to answer at all. */
export function isMissingObject(err: unknown): boolean {
  const e = err as { name?: string; code?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.Code === "NoSuchKey" || e?.code === "ENOENT" || e?.$metadata?.httpStatusCode === 404;
}

/**
 * The error a customer sees when a stored file cannot be read: "not found" only when storage said so; when storage itself is
 * down or timing out it is a 503 (retry later), so an outage is not mistaken for missing media (and is visible as a 5xx).
 */
export function storageReadError(err: unknown, notFoundMessage: string): AppError {
  if (isMissingObject(err)) return new NotFoundError(notFoundMessage);
  return new AppError("Media storage is not responding right now. Please try again in a moment.", 503, ERROR_CODES.SERVICE_UNAVAILABLE);
}
