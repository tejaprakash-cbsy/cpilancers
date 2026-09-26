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
 * Standard API error formatter for route handlers
 */
export function formatErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
      statusCode: error.statusCode,
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
      },
      statusCode: 400,
    };
  }

  const err = error instanceof Error ? error : new Error('Unknown server error');
  console.error('[Unhandled Server Error]:', err);

  return {
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please try again later.'
        : err?.message || 'Unknown server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
    statusCode: 500,
  };
}
