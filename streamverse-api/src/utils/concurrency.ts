import { ConflictError } from "./errors";

/**
 * Section 62: optimistic concurrency via `updatedAt`. The caller sends back the `updatedAt` it last read;
 * if the row has moved on since, this is a stale write — reject with 409 instead of silently overwriting
 * someone else's (or another tab's) change. Skipped when the caller doesn't send one, so existing
 * clients that don't know about this yet keep working.
 */
export function assertNotStale(current: Date, expected: Date | undefined): void {
  if (expected && current.getTime() !== expected.getTime()) {
    throw new ConflictError("This record was changed since you last loaded it. Reload and try again.");
  }
}
