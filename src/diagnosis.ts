import { StorageEngine } from './storage.js';
import { RegressionDiagnosis, NPlusOneDiagnosis } from './types.js';

export class DiagnosisEngine {
  constructor(private storage: StorageEngine) {}

  /**
   * Analyzes all active endpoints for performance regressions comparing current window to baseline.
   */
  public detectRegressions(
    currentWindowMs: number = 2 * 60 * 60 * 1000, // Last 2 hours
    baselineWindowMs: number = 24 * 60 * 60 * 1000 // Previous 24 hours
  ): RegressionDiagnosis[] {
    const now = Date.now();
    const currentStart = now - currentWindowMs;
    const baselineStart = now - currentWindowMs - baselineWindowMs;
    const baselineEnd = currentStart;

    const routes = this.storage.getDistinctRoutes();
    const regressions: RegressionDiagnosis[] = [];

    for (const { route, method } of routes) {
      const currentReqs = this.storage.getRawRequestsInWindow(route, currentStart, now);
      const baselineReqs = this.storage.getRawRequestsInWindow(route, baselineStart, baselineEnd);

      // Need minimum sample size to avoid false alarms
      if (currentReqs.length < 3 || baselineReqs.length < 3) {
        continue;
      }

      const currentDurations = currentReqs.map((r) => r.duration_ms).sort((a, b) => a - b);
      const baselineDurations = baselineReqs.map((r) => r.duration_ms).sort((a, b) => a - b);

      const currentP95 = this.storage.calculatePercentile(currentDurations, 95);
      const baselineP95 = this.storage.calculatePercentile(baselineDurations, 95);

      const deltaMs = Math.round((currentP95 - baselineP95) * 100) / 100;
      const increasePercentage = baselineP95 > 0 
        ? Math.round(((currentP95 - baselineP95) / baselineP95) * 10000) / 100 
        : 0;

      // Flag if regression > 25% and > 25ms
      if (deltaMs > 25 && increasePercentage >= 25) {
        // Find culprit SQL queries
        const currentTraceIds = currentReqs.map((r) => r.trace_id);
        const baselineTraceIds = baselineReqs.map((r) => r.trace_id);

        const currentQueries = this.storage.getQueriesForTraces(currentTraceIds);
        const baselineQueries = this.storage.getQueriesForTraces(baselineTraceIds);

        // Group by fingerprint
        const currentGroup = this.groupQueriesByFingerprint(currentQueries);
        const baselineGroup = this.groupQueriesByFingerprint(baselineQueries);

        const culprits: RegressionDiagnosis['topCulpritQueries'] = [];
        let totalSqlDelta = 0;

        for (const [fingerprint, currData] of currentGroup.entries()) {
          const baseData = baselineGroup.get(fingerprint);
          const currAvg = currData.totalDuration / currData.count;
          const baseAvg = baseData ? baseData.totalDuration / baseData.count : 0;
          const qDelta = currAvg - baseAvg;

          // A query is a legitimate culprit if:
          // 1. It slowed down by at least 15ms and >= 25% increase, OR
          // 2. It is a new slow query averaging >= 50ms
          const isSignificantSlowdown = qDelta >= 15 && (baseAvg === 0 ? currAvg >= 50 : (qDelta / baseAvg) >= 0.25);
          
          if (isSignificantSlowdown) {
            const qIncreasePct = baseAvg > 0 ? Math.round((qDelta / baseAvg) * 10000) / 100 : 999;
            const approxTotalImpact = (currData.totalDuration / currentReqs.length) - (baseData ? (baseData.totalDuration / baselineReqs.length) : 0);
            totalSqlDelta += Math.max(0, approxTotalImpact);

            // Compute contribution to the total request delta
            const rawContribution = deltaMs > 0 ? (qDelta / deltaMs) * 100 : 0;

            // Must explain at least 8% of the request regression to be flagged
            if (rawContribution >= 8) {
              culprits.push({
                fingerprint,
                sampleSql: currData.sampleSql,
                baselineAvgMs: Math.round(baseAvg * 100) / 100,
                currentAvgMs: Math.round(currAvg * 100) / 100,
                deltaMs: Math.round(qDelta * 100) / 100,
                increasePercentage: qIncreasePct,
                contributionToLatencyPercent: Math.min(100, Math.round(rawContribution * 100) / 100),
              });
            }
          }
        }

        culprits.sort((a, b) => b.deltaMs - a.deltaMs);

        // Recommendations and causes
        const recommendations: string[] = [];
        let suspectedCause = 'Application logic latency, CPU blocking, or external I/O delay';

        // Check if database slowdown truly explains the majority of the endpoint regression
        const totalContribution = culprits.reduce((sum, c) => sum + c.contributionToLatencyPercent, 0);

        if (culprits.length > 0 && totalContribution >= 30) {
          const top = culprits[0];
          suspectedCause = `Database query regression in "${top.fingerprint.slice(0, 60)}..." (slowdown of +${top.deltaMs}ms, explains ${top.contributionToLatencyPercent}% of regression)`;
          recommendations.push(`Inspect EXPLAIN plan for query: ${top.sampleSql}`);
          recommendations.push(`Verify indexes on queried tables (check WHERE, ORDER BY, and JOIN columns)`);
          recommendations.push(`Check if table row count drastically increased without adequate indexing`);
        } else {
          recommendations.push(`Profile synchronous CPU blocking operations or external API calls inside route handler`);
          recommendations.push(`Check if server CPU or memory pressure increased`);
        }

        let severity: RegressionDiagnosis['severity'] = 'NOTICE';
        if (increasePercentage >= 100 || deltaMs >= 300) {
          severity = 'CRITICAL';
        } else if (increasePercentage >= 40 || deltaMs >= 100) {
          severity = 'WARNING';
        }

        regressions.push({
          route,
          method,
          baselineP95Ms: baselineP95,
          currentP95Ms: currentP95,
          deltaMs,
          increasePercentage,
          severity,
          suspectedCause,
          recommendations,
          topCulpritQueries: culprits,
        });
      }
    }

    return regressions.sort((a, b) => b.deltaMs - a.deltaMs);
  }

  /**
   * Detects N+1 query patterns across all tracked endpoints.
   */
  public detectNPlusOne(sinceTimestamp: number = 0): NPlusOneDiagnosis[] {
    const traces = this.storage.getRecentTraces(200);
    const routeQueriesMap = new Map<string, {
      method: string;
      route: string;
      requestCount: number;
      fingerprints: Map<string, {
        sampleSql: string;
        occurrencesPerTrace: number[];
        durations: number[];
      }>;
    }>();

    for (const trace of traces) {
      if (trace.timestamp < sinceTimestamp) continue;
      const key = `${trace.method} ${trace.route}`;
      if (!routeQueriesMap.has(key)) {
        routeQueriesMap.set(key, {
          method: trace.method,
          route: trace.route,
          requestCount: 0,
          fingerprints: new Map(),
        });
      }

      const entry = routeQueriesMap.get(key)!;
      entry.requestCount++;

      // Count occurrences of each fingerprint in this single trace
      const countInTrace = new Map<string, { count: number; sampleSql: string; totalDuration: number }>();
      for (const q of trace.queries) {
        if (!countInTrace.has(q.fingerprint)) {
          countInTrace.set(q.fingerprint, { count: 0, sampleSql: q.rawSql, totalDuration: 0 });
        }
        const item = countInTrace.get(q.fingerprint)!;
        item.count++;
        item.totalDuration += q.durationMs;
      }

      for (const [fp, data] of countInTrace.entries()) {
        if (!entry.fingerprints.has(fp)) {
          entry.fingerprints.set(fp, {
            sampleSql: data.sampleSql,
            occurrencesPerTrace: [],
            durations: [],
          });
        }
        entry.fingerprints.get(fp)!.occurrencesPerTrace.push(data.count);
        entry.fingerprints.get(fp)!.durations.push(data.totalDuration);
      }
    }

    const nPlusOneList: NPlusOneDiagnosis[] = [];

    for (const { method, route, requestCount, fingerprints } of routeQueriesMap.values()) {
      if (requestCount < 2) continue;

      for (const [fp, data] of fingerprints.entries()) {
        const totalOccurrences = data.occurrencesPerTrace.reduce((a, b) => a + b, 0);
        const avgPerReq = Math.round((totalOccurrences / requestCount) * 10) / 10;
        const maxInSingleReq = Math.max(...data.occurrencesPerTrace);

        // Flag if executed >= 3 times on average in single request OR max >= 5
        if (avgPerReq >= 3 || maxInSingleReq >= 5) {
          const totalDuration = data.durations.reduce((a, b) => a + b, 0);
          const avgTimeWasted = Math.round(((totalDuration / requestCount) * ((avgPerReq - 1) / Math.max(1, avgPerReq))) * 100) / 100;

          nPlusOneList.push({
            route,
            method,
            queryFingerprint: fp,
            sampleSql: data.sampleSql,
            avgQueriesPerRequest: avgPerReq,
            maxQueriesInSingleRequest: maxInSingleReq,
            avgTimeWastedMs: avgTimeWasted,
            detectedCount: totalOccurrences,
            recommendation: `Replace the looped query with a batch SQL query using WHERE id IN (?) or eager load the relationship with a JOIN.`,
          });
        }
      }
    }

    return nPlusOneList.sort((a, b) => b.avgTimeWastedMs - a.avgTimeWastedMs);
  }

  private groupQueriesByFingerprint(queries: Array<{ fingerprint: string; raw_sql: string; duration_ms: number }>) {
    const map = new Map<string, { totalDuration: number; count: number; sampleSql: string }>();
    for (const q of queries) {
      if (!map.has(q.fingerprint)) {
        map.set(q.fingerprint, { totalDuration: 0, count: 0, sampleSql: q.raw_sql });
      }
      const item = map.get(q.fingerprint)!;
      item.totalDuration += q.duration_ms;
      item.count++;
    }
    return map;
  }
}
