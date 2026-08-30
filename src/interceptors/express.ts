import { Request, Response, NextFunction, RequestHandler } from 'express';
import { StorageEngine } from '../storage.js';
import { DiagnosisEngine } from '../diagnosis.js';
import { createDashboardRouter } from '../dashboard/router.js';
import { runWithContext } from '../context.js';
import { ApiWatchOptions, RequestContext, RequestRecord } from '../types.js';

let defaultStorage: StorageEngine | null = null;
let defaultDiagnosis: DiagnosisEngine | null = null;

export function getGlobalStorage(options?: ApiWatchOptions): StorageEngine {
  if (!defaultStorage) {
    defaultStorage = new StorageEngine(options);
  }
  return defaultStorage;
}

export function getGlobalDiagnosis(options?: ApiWatchOptions): DiagnosisEngine {
  if (!defaultDiagnosis) {
    const storage = getGlobalStorage(options);
    defaultDiagnosis = new DiagnosisEngine(storage);
  }
  return defaultDiagnosis;
}

/**
 * ApiWatch Express Middleware.
 * Plug into your Express app to instantly track endpoints, query correlations, regressions, and N+1 patterns.
 *
 * @example
 * import express from 'express';
 * import { apiwatch } from 'apiwatch';
 *
 * const app = express();
 * app.use(apiwatch());
 */
export function apiwatch(options: ApiWatchOptions = {}): RequestHandler {
  const storage = getGlobalStorage(options);
  const diagnosis = getGlobalDiagnosis(options);
  const dashboardPath = options.dashboardPath || '/__apiwatch';
  const dashboardRouter = createDashboardRouter(storage, diagnosis, options);

  let traceCounter = 0;

  return (req: Request, res: Response, next: NextFunction) => {
    // If request is targeting the dashboard, handle with dashboardRouter
    if (req.path === dashboardPath || req.path.startsWith(dashboardPath + '/')) {
      return dashboardRouter(req, res, next);
    }

    traceCounter++;
    const traceId = `tr_${Date.now()}_${traceCounter}`;
    const startHrTime = performance.now();

    const context: RequestContext = {
      traceId,
      method: req.method,
      route: req.path, // Will be updated on finish with matched route pattern
      url: req.originalUrl || req.url,
      startTime: Date.now(),
      queries: [],
    };

    // Intercept response finish
    res.on('finish', () => {
      const durationMs = Math.round((performance.now() - startHrTime) * 100) / 100;

      // Extract matched route pattern if available (e.g. /api/users/:id instead of /api/users/123)
      let matchedRoute = req.baseUrl || '';
      if (req.route && req.route.path) {
        matchedRoute += req.route.path;
      } else {
        matchedRoute = req.path;
      }

      context.route = matchedRoute;

      // Calculate total SQL duration
      const totalSqlMs = Math.round(
        context.queries.reduce((sum, q) => sum + q.durationMs, 0) * 100
      ) / 100;

      const record: RequestRecord = {
        id: traceId,
        traceId,
        method: req.method,
        route: matchedRoute,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs,
        queryCount: context.queries.length,
        totalSqlMs,
        timestamp: context.startTime,
      };

      // Store in SQLite
      storage.saveRequestAndQueries(record, context.queries);
    });

    // Execute downstream middleware inside AsyncLocalStorage context
    runWithContext(context, () => {
      next();
    });
  };
}
