/**
 * Base Service Abstract Class
 * Provides common database interaction helpers and error formatting
 */

import { AppError } from '@/lib/errors';

export abstract class BaseService {
  protected static handleError(error: unknown, context: string): never {
    console.error(`[Service Error - ${context}]:`, error);
    if (error instanceof AppError) throw error;
    const err = error as { message?: string; statusCode?: number; code?: string };
    throw new AppError(err.message || 'An unexpected service error occurred', err.statusCode || 500, err.code || 'SERVICE_ERROR');
  }

  protected handleError(error: unknown, context: string): never {
    console.error(`[Service Error - ${context}]:`, error);

    if (error instanceof AppError) {
      throw error;
    }

    const err = error as { message?: string; statusCode?: number; code?: string };
    throw new AppError(
      err?.message || 'An unexpected service error occurred',
      err?.statusCode || 500,
      err?.code || 'SERVICE_ERROR'
    );
  }
}
