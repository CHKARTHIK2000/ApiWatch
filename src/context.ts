import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContext, CapturedQuery } from './types.js';
import { sanitizeSql } from './normalizer.js';

export const storage = new AsyncLocalStorage<RequestContext>();

let queryCounter = 0;

/**
 * Returns the current request context from AsyncLocalStorage.
 */
export function getCurrentContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Executes a callback within a request context.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Records a database query in the active request context.
 */
export function recordCapturedQuery(
  rawSql: string,
  fingerprint: string,
  durationMs: number,
  driver?: string
): CapturedQuery | null {
  const ctx = getCurrentContext();
  if (!ctx) return null;

  queryCounter++;
  const sanitized = sanitizeSql(rawSql);

  const query: CapturedQuery = {
    id: `q_${Date.now()}_${queryCounter}`,
    traceId: ctx.traceId,
    route: ctx.route,
    rawSql: sanitized,
    fingerprint,
    durationMs: Math.round(durationMs * 100) / 100,
    timestamp: Date.now(),
    driver: driver || 'unknown',
  };

  ctx.queries.push(query);
  return query;
}
