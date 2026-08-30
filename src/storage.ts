import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  RequestRecord,
  CapturedQuery,
  EndpointStats,
  QueryStats,
  ApiWatchOptions,
} from './types.js';

export class StorageEngine {
  private db: DatabaseSync;
  private maxRetainedTraces: number;

  constructor(options: ApiWatchOptions = {}) {
    const dbPath = options.dbPath || path.join(process.cwd(), '.apiwatch.db');
    this.maxRetainedTraces = options.maxRetainedTraces || 20000;

    // Ensure directory exists if needed
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        method TEXT NOT NULL,
        route TEXT NOT NULL,
        url TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        query_count INTEGER DEFAULT 0,
        total_sql_ms REAL DEFAULT 0,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queries (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        route TEXT NOT NULL,
        raw_sql TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        driver TEXT DEFAULT 'unknown'
      );

      CREATE INDEX IF NOT EXISTS idx_requests_route_ts ON requests(route, timestamp);
      CREATE INDEX IF NOT EXISTS idx_requests_trace_id ON requests(trace_id);
      CREATE INDEX IF NOT EXISTS idx_queries_trace_id ON queries(trace_id);
      CREATE INDEX IF NOT EXISTS idx_queries_fingerprint ON queries(fingerprint, timestamp);
      CREATE INDEX IF NOT EXISTS idx_queries_route_ts ON queries(route, timestamp);
    `);
  }

  public saveRequestAndQueries(req: RequestRecord, queries: CapturedQuery[]): void {
    const insertReq = this.db.prepare(`
      INSERT OR REPLACE INTO requests (id, trace_id, method, route, url, status_code, duration_ms, query_count, total_sql_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertReq.run(
      req.id,
      req.traceId,
      req.method,
      req.route,
      req.url,
      req.statusCode,
      req.durationMs,
      req.queryCount,
      req.totalSqlMs,
      req.timestamp
    );

    if (queries.length > 0) {
      const insertQuery = this.db.prepare(`
        INSERT OR REPLACE INTO queries (id, trace_id, route, raw_sql, fingerprint, duration_ms, timestamp, driver)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const q of queries) {
        insertQuery.run(
          q.id,
          q.traceId,
          q.route,
          q.rawSql,
          q.fingerprint,
          q.durationMs,
          q.timestamp,
          q.driver || 'unknown'
        );
      }
    }
  }

  public getEndpointStats(sinceTimestamp: number = 0): EndpointStats[] {
    const rows = this.db.prepare(`
      SELECT route, method, duration_ms, status_code, query_count, total_sql_ms
      FROM requests
      WHERE timestamp >= ?
      ORDER BY route, duration_ms ASC
    `).all(sinceTimestamp) as Array<{
      route: string;
      method: string;
      duration_ms: number;
      status_code: number;
      query_count: number;
      total_sql_ms: number;
    }>;

    const grouped = new Map<string, Array<{
      duration_ms: number;
      status_code: number;
      query_count: number;
      total_sql_ms: number;
      method: string;
    }>>();

    for (const r of rows) {
      const key = `${r.method} ${r.route}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(r);
    }

    const results: EndpointStats[] = [];

    for (const [key, items] of grouped.entries()) {
      const [method, ...routeParts] = key.split(' ');
      const route = routeParts.join(' ');
      const durations = items.map((i) => i.duration_ms).sort((a, b) => a - b);
      const totalRequests = durations.length;
      const sumDuration = durations.reduce((a, b) => a + b, 0);
      const avgDurationMs = Math.round((sumDuration / totalRequests) * 100) / 100;

      const p50Ms = this.calculatePercentile(durations, 50);
      const p90Ms = this.calculatePercentile(durations, 90);
      const p95Ms = this.calculatePercentile(durations, 95);
      const p99Ms = this.calculatePercentile(durations, 99);

      const errorCount = items.filter((i) => i.status_code >= 500).length;
      const errorRate = Math.round((errorCount / totalRequests) * 10000) / 100; // e.g. 1.25%

      const totalQueries = items.reduce((a, b) => a + b.query_count, 0);
      const avgQueriesPerRequest = Math.round((totalQueries / totalRequests) * 10) / 10;

      const totalSqlMs = items.reduce((a, b) => a + b.total_sql_ms, 0);
      const avgSqlDurationMs = Math.round((totalSqlMs / totalRequests) * 100) / 100;

      results.push({
        route,
        method,
        totalRequests,
        avgDurationMs,
        p50Ms,
        p90Ms,
        p95Ms,
        p99Ms,
        minDurationMs: durations[0],
        maxDurationMs: durations[durations.length - 1],
        errorCount,
        errorRate,
        avgQueriesPerRequest,
        avgSqlDurationMs,
      });
    }

    // Sort by p95 descending
    return results.sort((a, b) => b.p95Ms - a.p95Ms);
  }

  public getQueryStats(sinceTimestamp: number = 0, routeFilter?: string): QueryStats[] {
    let sql = `
      SELECT fingerprint, raw_sql, route, duration_ms
      FROM queries
      WHERE timestamp >= ?
    `;
    const params: any[] = [sinceTimestamp];

    if (routeFilter) {
      sql += ` AND route = ?`;
      params.push(routeFilter);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      fingerprint: string;
      raw_sql: string;
      route: string;
      duration_ms: number;
    }>;

    const grouped = new Map<string, {
      fingerprint: string;
      sampleSql: string;
      route: string;
      durations: number[];
    }>();

    for (const r of rows) {
      if (!grouped.has(r.fingerprint)) {
        grouped.set(r.fingerprint, {
          fingerprint: r.fingerprint,
          sampleSql: r.raw_sql,
          route: r.route,
          durations: [],
        });
      }
      grouped.get(r.fingerprint)!.durations.push(r.duration_ms);
    }

    const results: QueryStats[] = [];

    for (const item of grouped.values()) {
      const sorted = item.durations.sort((a, b) => a - b);
      const callCount = sorted.length;
      const totalDurationMs = Math.round(sorted.reduce((a, b) => a + b, 0) * 100) / 100;
      const avgDurationMs = Math.round((totalDurationMs / callCount) * 100) / 100;
      const p95Ms = this.calculatePercentile(sorted, 95);
      const maxDurationMs = sorted[sorted.length - 1];

      results.push({
        fingerprint: item.fingerprint,
        sampleSql: item.sampleSql,
        route: item.route,
        callCount,
        avgDurationMs,
        p95Ms,
        maxDurationMs,
        totalDurationMs,
      });
    }

    return results.sort((a, b) => b.totalDurationMs - a.totalDurationMs);
  }

  public getRecentTraces(limit: number = 50, routeFilter?: string): Array<RequestRecord & { queries: CapturedQuery[] }> {
    let sql = `SELECT * FROM requests`;
    const params: any[] = [];

    if (routeFilter) {
      sql += ` WHERE route = ?`;
      params.push(routeFilter);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const requests = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      trace_id: string;
      method: string;
      route: string;
      url: string;
      status_code: number;
      duration_ms: number;
      query_count: number;
      total_sql_ms: number;
      timestamp: number;
    }>;

    return requests.map((r) => {
      const queries = this.db.prepare(`
        SELECT * FROM queries WHERE trace_id = ? ORDER BY timestamp ASC
      `).all(r.trace_id) as Array<{
        id: string;
        trace_id: string;
        route: string;
        raw_sql: string;
        fingerprint: string;
        duration_ms: number;
        timestamp: number;
        driver: string;
      }>;

      return {
        id: r.id,
        traceId: r.trace_id,
        method: r.method,
        route: r.route,
        url: r.url,
        statusCode: r.status_code,
        durationMs: r.duration_ms,
        queryCount: r.query_count,
        totalSqlMs: r.total_sql_ms,
        timestamp: r.timestamp,
        queries: queries.map((q) => ({
          id: q.id,
          traceId: q.trace_id,
          route: q.route,
          rawSql: q.raw_sql,
          fingerprint: q.fingerprint,
          durationMs: q.duration_ms,
          timestamp: q.timestamp,
          driver: q.driver,
        })),
      };
    });
  }

  public getTraceById(traceId: string): (RequestRecord & { queries: CapturedQuery[] }) | null {
    const r = this.db.prepare(`
      SELECT * FROM requests WHERE trace_id = ? LIMIT 1
    `).get(traceId) as any;

    if (!r) return null;

    const queries = this.db.prepare(`
      SELECT * FROM queries WHERE trace_id = ? ORDER BY timestamp ASC
    `).all(traceId) as any[];

    return {
      id: r.id,
      traceId: r.trace_id,
      method: r.method,
      route: r.route,
      url: r.url,
      statusCode: r.status_code,
      durationMs: r.duration_ms,
      queryCount: r.query_count,
      totalSqlMs: r.total_sql_ms,
      timestamp: r.timestamp,
      queries: queries.map((q) => ({
        id: q.id,
        traceId: q.trace_id,
        route: q.route,
        rawSql: q.raw_sql,
        fingerprint: q.fingerprint,
        durationMs: q.duration_ms,
        timestamp: q.timestamp,
        driver: q.driver,
      })),
    };
  }

  public getOverviewStats() {
    const now = Date.now();
    const past24h = now - 24 * 60 * 60 * 1000;

    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as error_count,
        COUNT(DISTINCT route) as distinct_routes,
        SUM(query_count) as total_queries
      FROM requests
      WHERE timestamp >= ?
    `).get(past24h) as any;

    const durations = (this.db.prepare(`
      SELECT duration_ms FROM requests WHERE timestamp >= ? ORDER BY duration_ms ASC
    `).all(past24h) as Array<{ duration_ms: number }>).map((d) => d.duration_ms);

    return {
      totalRequests: stats?.total_requests || 0,
      avgDurationMs: Math.round((stats?.avg_duration || 0) * 100) / 100,
      p95DurationMs: this.calculatePercentile(durations, 95),
      errorCount: stats?.error_count || 0,
      errorRate: stats?.total_requests ? Math.round((stats.error_count / stats.total_requests) * 10000) / 100 : 0,
      distinctRoutes: stats?.distinct_routes || 0,
      totalQueries: stats?.total_queries || 0,
    };
  }

  public getRawRequestsInWindow(route: string, startTime: number, endTime: number): Array<{ duration_ms: number; trace_id: string }> {
    return this.db.prepare(`
      SELECT duration_ms, trace_id
      FROM requests
      WHERE route = ? AND timestamp >= ? AND timestamp < ?
      ORDER BY duration_ms ASC
    `).all(route, startTime, endTime) as any[];
  }

  public getDistinctRoutes(): Array<{ route: string; method: string }> {
    return this.db.prepare(`
      SELECT DISTINCT route, method FROM requests ORDER BY route ASC
    `).all() as any[];
  }

  public getQueriesForTraces(traceIds: string[]): Array<{ fingerprint: string; raw_sql: string; duration_ms: number; trace_id: string }> {
    if (traceIds.length === 0) return [];
    // SQLite parameter chunking
    const placeholders = traceIds.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT fingerprint, raw_sql, duration_ms, trace_id
      FROM queries
      WHERE trace_id IN (${placeholders})
    `).all(...traceIds) as any[];
  }

  public clearAllData(): void {
    this.db.exec(`
      DELETE FROM queries;
      DELETE FROM requests;
      VACUUM;
    `);
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // Ignore if already closed
    }
  }

  public calculatePercentile(sortedArray: number[], percentile: number): number {
    if (!sortedArray || sortedArray.length === 0) return 0;
    if (percentile <= 0) return sortedArray[0];
    if (percentile >= 100) return sortedArray[sortedArray.length - 1];

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return Math.round(sortedArray[lower] * 100) / 100;
    }

    const interpolated = sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    return Math.round(interpolated * 100) / 100;
  }
}
