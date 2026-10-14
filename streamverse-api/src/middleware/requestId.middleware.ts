import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

// A caller-supplied id is only reused when it is short and plain, so it cannot inject into logs or headers.
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Gives every request one id: set on req.id, returned as X-Request-Id, and attached to every log line. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
};
