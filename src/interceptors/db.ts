import { recordCapturedQuery } from '../context.js';
import { normalizeSql } from '../normalizer.js';

/**
 * Universal wrapper for any database query execution.
 * Measures execution time and automatically links it to the current active HTTP request.
 *
 * @example
 * const rows = await trackQuery('SELECT * FROM users WHERE id = ?', async () => {
 *   return await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 * }, 'mysql2');
 */
export async function trackQuery<T>(
  rawSql: string,
  queryFn: () => Promise<T> | T,
  driver: string = 'sql'
): Promise<T> {
  const start = performance.now();
  const fingerprint = normalizeSql(rawSql);

  try {
    const result = await queryFn();
    const duration = performance.now() - start;
    recordCapturedQuery(rawSql, fingerprint, duration, driver);
    return result;
  } catch (err) {
    const duration = performance.now() - start;
    recordCapturedQuery(rawSql, fingerprint, duration, driver);
    throw err;
  }
}

/**
 * Synchronous version of trackQuery for synchronous DB drivers like better-sqlite3 or node:sqlite.
 */
export function trackQuerySync<T>(
  rawSql: string,
  queryFn: () => T,
  driver: string = 'sqlite'
): T {
  const start = performance.now();
  const fingerprint = normalizeSql(rawSql);

  try {
    const result = queryFn();
    const duration = performance.now() - start;
    recordCapturedQuery(rawSql, fingerprint, duration, driver);
    return result;
  } catch (err) {
    const duration = performance.now() - start;
    recordCapturedQuery(rawSql, fingerprint, duration, driver);
    throw err;
  }
}

/**
 * Auto-instruments a mysql2 / pg pool or connection object by proxying its .query and .execute methods.
 */
export function instrumentDatabaseObject<T extends Record<string, any>>(target: T, driverName: string = 'db'): T {
  const obj = target as any;
  const originalQuery = obj.query;
  const originalExecute = obj.execute;

  if (typeof originalQuery === 'function') {
    obj.query = function (this: any, ...args: any[]) {
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.sql || 'UNKNOWN_SQL';
      
      // If callback style
      const lastArg = args[args.length - 1];
      if (typeof lastArg === 'function') {
        const start = performance.now();
        const callback = lastArg;
        args[args.length - 1] = function (this: any, ...cbArgs: any[]) {
          const duration = performance.now() - start;
          recordCapturedQuery(sql, normalizeSql(sql), duration, driverName);
          return callback.apply(this, cbArgs);
        };
        return originalQuery.apply(this, args);
      }

      // If promise style
      return trackQuery(sql, () => originalQuery.apply(this, args), driverName);
    };
  }

  if (typeof originalExecute === 'function') {
    obj.execute = function (this: any, ...args: any[]) {
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.sql || 'UNKNOWN_SQL';
      return trackQuery(sql, () => originalExecute.apply(this, args), driverName);
    };
  }

  return target;
}
