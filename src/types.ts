export interface CapturedQuery {
  id: string;
  traceId: string;
  route: string;
  rawSql: string;
  fingerprint: string;
  durationMs: number;
  timestamp: number;
  driver?: string;
}

export interface RequestContext {
  traceId: string;
  method: string;
  route: string;
  url: string;
  startTime: number;
  queries: CapturedQuery[];
  metadata?: Record<string, any>;
}

export interface RequestRecord {
  id: string;
  traceId: string;
  method: string;
  route: string;
  url: string;
  statusCode: number;
  durationMs: number;
  queryCount: number;
  totalSqlMs: number;
  timestamp: number;
}

export interface EndpointStats {
  route: string;
  method: string;
  totalRequests: number;
  avgDurationMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  minDurationMs: number;
  maxDurationMs: number;
  errorCount: number;
  errorRate: number;
  avgQueriesPerRequest: number;
  avgSqlDurationMs: number;
}

export interface QueryStats {
  fingerprint: string;
  sampleSql: string;
  route: string;
  callCount: number;
  avgDurationMs: number;
  p95Ms: number;
  maxDurationMs: number;
  totalDurationMs: number;
}

export interface RegressionDiagnosis {
  route: string;
  method: string;
  baselineP95Ms: number;
  currentP95Ms: number;
  deltaMs: number;
  increasePercentage: number;
  severity: 'CRITICAL' | 'WARNING' | 'NOTICE';
  suspectedCause: string;
  recommendations: string[];
  topCulpritQueries: Array<{
    fingerprint: string;
    sampleSql: string;
    baselineAvgMs: number;
    currentAvgMs: number;
    deltaMs: number;
    increasePercentage: number;
    contributionToLatencyPercent: number;
  }>;
}

export interface NPlusOneDiagnosis {
  route: string;
  method: string;
  queryFingerprint: string;
  sampleSql: string;
  avgQueriesPerRequest: number;
  maxQueriesInSingleRequest: number;
  avgTimeWastedMs: number;
  detectedCount: number;
  recommendation: string;
}

export interface ApiWatchOptions {
  /** Database file path for SQLite storage. Defaults to '.apiwatch.db' */
  dbPath?: string;
  /** Path for web dashboard. Defaults to '/__apiwatch' */
  dashboardPath?: string;
  /** Whether to capture query traces. Defaults to true */
  captureQueries?: boolean;
  /** Secret token to protect dashboard access (optional) */
  secretToken?: string;
  /** Maximum number of raw request traces to retain (defaults to 10,000) */
  maxRetainedTraces?: number;
  /** Slow request threshold in ms to flag. Defaults to 250ms */
  slowRequestThresholdMs?: number;
  /** Slow query threshold in ms to flag. Defaults to 50ms */
  slowQueryThresholdMs?: number;
}
