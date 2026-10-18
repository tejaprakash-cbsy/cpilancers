import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const CORRELATION_ID_HEADER = 'x-request-id';

/** Accept only UUID request IDs; arbitrary header values are never reflected. */
export function resolveCorrelationId(request?: Request): string {
  const incoming = request?.headers.get(CORRELATION_ID_HEADER);
  if (incoming && z.uuid().safeParse(incoming).success) return incoming;
  return randomUUID();
}
