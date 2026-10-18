/**
 * Custom Application Error Hierarchy
 */

import { z } from 'zod';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required to perform this action') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} was not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict detected') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Field-level shape for a single Zod validation issue.
 *
 * Only the path, the Zod issue code and the schema-declared message are
 * exposed. Raw input values are deliberately never included so that
 * credentials submitted to auth endpoints cannot leak through an error body.
 */
export interface ValidationIssueDetail {
  field: string;
  code: string;
  message: string;
}

/**
 * Normalise a ZodError into serialisable, per-field details.
 */
function toValidationDetails(error: z.ZodError): ValidationIssueDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.map((segment) => String(segment)).join('.'),
    code: issue.code,
    message: issue.message,
  }));
}

/**
 * Node/undici report a JSON parse failure as a `SyntaxError` subclass in some
 * runtimes and as a plain `Error` carrying a `cause` in others, so match on the
 * shape rather than the constructor alone.
 */
function isJsonSyntaxError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`;
  return /unexpected (end of json input|token)|json|is not valid JSON/i.test(message);
}

/**
 * Standard API error formatter for route handlers
 */
const PUBLIC_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Authentication required.',
  FORBIDDEN: 'Access denied.',
  NOT_FOUND: 'Resource not found.',
  VALIDATION_ERROR: 'Validation failed.',
  CONFLICT: 'Resource state conflict.',
};

function safeDetails(details: unknown): ValidationIssueDetail[] | undefined {
  if (!Array.isArray(details)) return undefined;
  const safe = details.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const value = item as Record<string, unknown>;
    return typeof value.code === 'string' && typeof value.message === 'string' &&
      (typeof value.field === 'string' || Array.isArray(value.path));
  }).map((item) => {
    const value = item as Record<string, unknown>;
    const path = typeof value.field === 'string' ? value.field : (value.path as unknown[]).map(String).join('.');
    return { field: path, code: value.code as string, message: value.message as string };
  });
  return safe.length ? safe : undefined;
}

export function formatErrorResponse(error: unknown, correlationId?: string) {
  const requestId = correlationId;
  if (error instanceof AppError) {
    const message = error.statusCode >= 500
      ? 'Request could not be completed.'
      : error.code === 'NOT_FOUND'
      ? 'Resource not found.'
      : error.details
      ? (PUBLIC_MESSAGES[error.code] ?? 'Request could not be completed.')
      : (error.message || (PUBLIC_MESSAGES[error.code] ?? 'Request could not be completed.'));
    const publicError: { message: string; code: string; details?: ValidationIssueDetail[]; correlationId?: string } = {
      message,
      code: error.code,
    };
    const details = error.details instanceof z.ZodError ? toValidationDetails(error.details) : safeDetails(error.details);
    if (details) publicError.details = details;
    if (requestId) publicError.correlationId = requestId;
    return {
      success: false,
      error: publicError,
      statusCode: error.statusCode,
    };
  }

  // A body that is not valid JSON is a client input error, not a server fault.
  // `request.json()` rejects with a plain `SyntaxError`, which previously fell
  // through to the generic branch below and was reported as HTTP 500 -- a
  // malformed payload, a truncated upload and a request with no body at all
  // all produced a 500 instead of a 400.
  if (error instanceof SyntaxError || isJsonSyntaxError(error)) {
    return {
      success: false,
      error: {
        message: 'Request body must be valid JSON.',
        code: 'INVALID_JSON',
        ...(requestId ? { correlationId: requestId } : {}),
      },
      statusCode: 400,
    };
  }

  // A body that parsed but is not an object (`null`, a bare string, a number, an
  // array) cannot satisfy any request schema. Reading a property off it throws a
  // `TypeError` inside the handler, which again surfaced as a 500.
  if (error instanceof TypeError) {
    return {
      success: false,
      error: {
        message: 'Request body must be a JSON object.',
        code: 'INVALID_REQUEST_BODY',
        ...(requestId ? { correlationId: requestId } : {}),
      },
      statusCode: 400,
    };
  }

  // A rejected `schema.parse()` is a client input error, not a server fault.
  // Without this branch a ZodError fell through to the generic handler below
  // and every invalid request body was reported as HTTP 500.
  if (error instanceof z.ZodError) {
    const details = toValidationDetails(error);
    return {
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details,
        ...(requestId ? { correlationId: requestId } : {}),
      },
      statusCode: 400,
    };
  }

  const err = error instanceof Error ? error : undefined;
  console.error('[Unhandled Server Error]', {
    correlationId: requestId,
    name: err?.name ?? 'UnknownError',
    code: error instanceof AppError ? error.code : 'INTERNAL_SERVER_ERROR',
  });

  return {
    success: false,
    error: {
      message: 'An unexpected error occurred. Please try again later.',
      code: 'INTERNAL_SERVER_ERROR',
      ...(requestId ? { correlationId: requestId } : {}),
    },
    statusCode: 500,
  };
}
