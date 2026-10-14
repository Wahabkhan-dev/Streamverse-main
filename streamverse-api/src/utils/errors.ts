import { ERROR_CODES, type ErrorCode } from "../constants/errors";

export interface FieldError {
  /** where the problem is, e.g. "body.email" */
  path: string;
  message: string;
}

/** An error the API expects and may describe to the client. Anything else is reported as a generic 500. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code: ErrorCode = ERROR_CODES.INTERNAL,
    public readonly errors: FieldError[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(errors: FieldError[] = [], message = "Validation failed") {
    super(message, 400, ERROR_CODES.VALIDATION_FAILED, errors);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, ERROR_CODES.UNAUTHORIZED);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do this") {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, ERROR_CODES.NOT_FOUND);
  }
}
export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409, ERROR_CODES.CONFLICT);
  }
}
