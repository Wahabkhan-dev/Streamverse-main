import type { RequestHandler } from "express";
import type { z } from "zod";
import { ValidationError, type FieldError } from "../utils/errors";

interface Schemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

/**
 * Validates body, params and query with Zod. The parsed result REPLACES the raw input, so unknown keys are
 * stripped before a controller sees them (this is the mass-assignment guard: only fields in the schema survive).
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    const problems: FieldError[] = [];
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        (req as unknown as Record<string, unknown>)[part] = result.data;
      } else {
        for (const issue of result.error.issues) problems.push({ path: [part, ...issue.path].join("."), message: issue.message });
      }
    }
    next(problems.length ? new ValidationError(problems) : undefined);
  };
