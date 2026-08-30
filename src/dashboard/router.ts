import { Router, Request, Response } from 'express';
import { StorageEngine } from '../storage.js';
import { DiagnosisEngine } from '../diagnosis.js';
import { renderDashboardHtml } from './ui.js';
import { ApiWatchOptions } from '../types.js';

export function createDashboardRouter(
  storage: StorageEngine,
  diagnosis: DiagnosisEngine,
  options: ApiWatchOptions = {}
): Router {
  const router = Router();
  const basePath = options.dashboardPath || '/__apiwatch';

  // Secret token authentication middleware if configured
  if (options.secretToken) {
    router.use(basePath, (req: Request, res: Response, next: any) => {
      const token = req.query.token || req.headers['x-apiwatch-token'];
      if (token !== options.secretToken) {
        res.status(401).send('Unauthorized: Invalid ApiWatch token');
        return;
      }
      next();
    });
  }

  // Serve Dashboard HTML
  router.get(basePath, (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderDashboardHtml(basePath));
  });

  // API: Overview
  router.get(`${basePath}/api/overview`, (_req: Request, res: Response) => {
    res.json(storage.getOverviewStats());
  });

  // API: Endpoints summary
  router.get(`${basePath}/api/endpoints`, (_req: Request, res: Response) => {
    res.json(storage.getEndpointStats(0));
  });

  // API: Slow queries
  router.get(`${basePath}/api/slow-queries`, (req: Request, res: Response) => {
    const route = typeof req.query.route === 'string' ? req.query.route : undefined;
    res.json(storage.getQueryStats(0, route));
  });

  // API: Regressions detection
  router.get(`${basePath}/api/regressions`, (_req: Request, res: Response) => {
    res.json(diagnosis.detectRegressions());
  });

  // API: N+1 query patterns
  router.get(`${basePath}/api/n-plus-one`, (_req: Request, res: Response) => {
    res.json(diagnosis.detectNPlusOne(0));
  });

  // API: Recent traces
  router.get(`${basePath}/api/traces`, (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const route = typeof req.query.route === 'string' ? req.query.route : undefined;
    res.json(storage.getRecentTraces(limit, route));
  });

  // API: Single trace details
  router.get(`${basePath}/api/trace/:id`, (req: Request, res: Response) => {
    const traceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const trace = storage.getTraceById(traceId);
    if (!trace) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }
    res.json(trace);
  });

  // API: Clear DB
  router.post(`${basePath}/api/clear`, (_req: Request, res: Response) => {
    storage.clearAllData();
    res.json({ success: true, message: 'All ApiWatch performance data cleared.' });
  });

  return router;
}
