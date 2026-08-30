import test from 'node:test';
import assert from 'node:assert';
import { StorageEngine } from '../src/storage.js';
import { DiagnosisEngine } from '../src/diagnosis.js';
import { normalizeSql } from '../src/normalizer.js';

test('8. N+1 Detection: Positive, negative, boundary, and distinct query tests', () => {
  const storage = new StorageEngine({ dbPath: ':memory:' });
  const diagnosis = new DiagnosisEngine(storage);
  const now = Date.now();

  // Helper to simulate a request with queries
  function recordRequest(route: string, traceId: string, queries: Array<{ sql: string; duration: number }>) {
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route,
        url: route,
        statusCode: 200,
        durationMs: queries.reduce((a, b) => a + b.duration, 0) + 10,
        queryCount: queries.length,
        totalSqlMs: queries.reduce((a, b) => a + b.duration, 0),
        timestamp: now,
      },
      queries.map((q, idx) => ({
        id: `${traceId}_q${idx}`,
        traceId,
        route,
        rawSql: q.sql,
        fingerprint: normalizeSql(q.sql),
        durationMs: q.duration,
        timestamp: now,
      }))
    );
  }

  // 1. Positive Case: Route /posts has 8 repeated queries
  for (let i = 1; i <= 5; i++) {
    const qs = [];
    for (let p = 1; p <= 8; p++) {
      qs.push({ sql: `SELECT * FROM posts WHERE id = ${p}`, duration: 10 });
    }
    recordRequest('/posts', `tr_pos_${i}`, qs);
  }

  // 2. Negative Case: Route /single has 1 query
  for (let i = 1; i <= 5; i++) {
    recordRequest('/single', `tr_neg_${i}`, [{ sql: `SELECT * FROM users WHERE id = ${i}`, duration: 5 }]);
  }

  // 3. Distinct Queries: Route /distinct has 4 different queries
  for (let i = 1; i <= 5; i++) {
    recordRequest('/distinct', `tr_dist_${i}`, [
      { sql: `SELECT * FROM table1 WHERE id = ${i}`, duration: 5 },
      { sql: `SELECT * FROM table2 WHERE id = ${i}`, duration: 5 },
      { sql: `SELECT * FROM table3 WHERE id = ${i}`, duration: 5 },
      { sql: `SELECT * FROM table4 WHERE id = ${i}`, duration: 5 },
    ]);
  }

  const nPlusOneAlerts = diagnosis.detectNPlusOne();

  // /posts must be flagged
  const postsAlert = nPlusOneAlerts.find((a) => a.route === '/posts');
  assert.ok(postsAlert, 'Expected /posts to be flagged as N+1');
  assert.strictEqual(postsAlert.avgQueriesPerRequest, 8);
  assert.ok(postsAlert.avgTimeWastedMs > 0);

  // /single must NOT be flagged
  const singleAlert = nPlusOneAlerts.find((a) => a.route === '/single');
  assert.strictEqual(singleAlert, undefined, '/single should not be flagged as N+1');

  // /distinct must NOT be flagged as N+1
  const distinctAlert = nPlusOneAlerts.find((a) => a.route === '/distinct');
  assert.strictEqual(distinctAlert, undefined, '/distinct has distinct queries, should not be flagged');
});

test('9 & 10. Regression Detection & Sample Size Boundary', () => {
  const storage = new StorageEngine({ dbPath: ':memory:' });
  const diagnosis = new DiagnosisEngine(storage);
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  // Case A: Insufficient current samples (5 baseline, only 2 current)
  // Even if latency jumped from 40ms to 600ms, do not trigger false alarm!
  for (let i = 1; i <= 5; i++) {
    storage.saveRequestAndQueries(
      {
        id: `tr_base_small_${i}`,
        traceId: `tr_base_small_${i}`,
        method: 'GET',
        route: '/api/insufficient-samples',
        url: '/api/insufficient-samples',
        statusCode: 200,
        durationMs: 40,
        queryCount: 0,
        totalSqlMs: 0,
        timestamp: now - 5 * oneHour + i * 1000,
      },
      []
    );
  }

  for (let i = 1; i <= 2; i++) {
    storage.saveRequestAndQueries(
      {
        id: `tr_curr_small_${i}`,
        traceId: `tr_curr_small_${i}`,
        method: 'GET',
        route: '/api/insufficient-samples',
        url: '/api/insufficient-samples',
        statusCode: 200,
        durationMs: 600,
        queryCount: 0,
        totalSqlMs: 0,
        timestamp: now - 10 * 60 * 1000 + i * 1000,
      },
      []
    );
  }

  const regressionsInsufficient = diagnosis.detectRegressions(2 * oneHour, 24 * oneHour);
  const insufficientAlert = regressionsInsufficient.find((r) => r.route === '/api/insufficient-samples');
  assert.strictEqual(
    insufficientAlert,
    undefined,
    'Must NOT trigger regression alarm with insufficient sample count (2 samples)'
  );
});

test('11 & 12. Culprit Query Attribution & Multiple Slow Queries', () => {
  const storage = new StorageEngine({ dbPath: ':memory:' });
  const diagnosis = new DiagnosisEngine(storage);
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  // Baseline: Route /multi-slow has query A (10ms) and query B (10ms) -> total 30ms
  for (let i = 1; i <= 10; i++) {
    const traceId = `tr_base_multi_${i}`;
    const ts = now - 5 * oneHour + i * 1000;
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/multi-slow',
        url: '/api/multi-slow',
        statusCode: 200,
        durationMs: 30,
        queryCount: 2,
        totalSqlMs: 20,
        timestamp: ts,
      },
      [
        {
          id: `${traceId}_qa`,
          traceId,
          route: '/api/multi-slow',
          rawSql: 'SELECT * FROM table_a WHERE id = 1',
          fingerprint: 'SELECT * FROM table_a WHERE id = ?',
          durationMs: 10,
          timestamp: ts,
        },
        {
          id: `${traceId}_qb`,
          traceId,
          route: '/api/multi-slow',
          rawSql: 'SELECT * FROM table_b WHERE id = 1',
          fingerprint: 'SELECT * FROM table_b WHERE id = ?',
          durationMs: 10,
          timestamp: ts,
        },
      ]
    );
  }

  // Today: Query A regressed to 200ms (+190ms) and Query B regressed to 250ms (+240ms) -> total 470ms
  for (let i = 1; i <= 10; i++) {
    const traceId = `tr_curr_multi_${i}`;
    const ts = now - 15 * 60 * 1000 + i * 1000;
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/multi-slow',
        url: '/api/multi-slow',
        statusCode: 200,
        durationMs: 470,
        queryCount: 2,
        totalSqlMs: 450,
        timestamp: ts,
      },
      [
        {
          id: `${traceId}_qa`,
          traceId,
          route: '/api/multi-slow',
          rawSql: 'SELECT * FROM table_a WHERE id = 1',
          fingerprint: 'SELECT * FROM table_a WHERE id = ?',
          durationMs: 200,
          timestamp: ts,
        },
        {
          id: `${traceId}_qb`,
          traceId,
          route: '/api/multi-slow',
          rawSql: 'SELECT * FROM table_b WHERE id = 1',
          fingerprint: 'SELECT * FROM table_b WHERE id = ?',
          durationMs: 250,
          timestamp: ts,
        },
      ]
    );
  }

  const regressions = diagnosis.detectRegressions(2 * oneHour, 24 * oneHour);
  const reg = regressions.find((r) => r.route === '/api/multi-slow');

  assert.ok(reg, 'Expected regression for /api/multi-slow');
  assert.strictEqual(reg.topCulpritQueries.length, 2, 'Both Query A and Query B should be identified as culprits');
  
  // Highest contributor should be Query B (delta +240ms) followed by Query A (delta +190ms)
  assert.strictEqual(reg.topCulpritQueries[0].fingerprint, 'SELECT * FROM table_b WHERE id = ?');
  assert.strictEqual(reg.topCulpritQueries[1].fingerprint, 'SELECT * FROM table_a WHERE id = ?');
});

test('28. Diagnosis Accuracy: Do not blame Database when Application / External API is the bottleneck', () => {
  const storage = new StorageEngine({ dbPath: ':memory:' });
  const diagnosis = new DiagnosisEngine(storage);
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  // Baseline: External API endpoint took 50ms total (SQL took 10ms)
  for (let i = 1; i <= 10; i++) {
    const traceId = `tr_base_ext_${i}`;
    const ts = now - 5 * oneHour + i * 1000;
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/external-sync',
        url: '/api/external-sync',
        statusCode: 200,
        durationMs: 50,
        queryCount: 1,
        totalSqlMs: 10,
        timestamp: ts,
      },
      [
        {
          id: `${traceId}_q`,
          traceId,
          route: '/api/external-sync',
          rawSql: 'SELECT token FROM auth_tokens WHERE id = 1',
          fingerprint: 'SELECT token FROM auth_tokens WHERE id = ?',
          durationMs: 10,
          timestamp: ts,
        },
      ]
    );
  }

  // Today: External API slowed down, total request is 500ms, but SQL STILL takes 10ms!
  for (let i = 1; i <= 10; i++) {
    const traceId = `tr_curr_ext_${i}`;
    const ts = now - 15 * 60 * 1000 + i * 1000;
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/external-sync',
        url: '/api/external-sync',
        statusCode: 200,
        durationMs: 500,
        queryCount: 1,
        totalSqlMs: 10,
        timestamp: ts,
      },
      [
        {
          id: `${traceId}_q`,
          traceId,
          route: '/api/external-sync',
          rawSql: 'SELECT token FROM auth_tokens WHERE id = 1',
          fingerprint: 'SELECT token FROM auth_tokens WHERE id = ?',
          durationMs: 10,
          timestamp: ts,
        },
      ]
    );
  }

  const regressions = diagnosis.detectRegressions(2 * oneHour, 24 * oneHour);
  const reg = regressions.find((r) => r.route === '/api/external-sync');

  assert.ok(reg, 'Regression should be detected for /api/external-sync');
  assert.strictEqual(reg.topCulpritQueries.length, 0, 'No SQL query regressed, so culprit queries list must be empty');
  assert.ok(
    reg.suspectedCause.toLowerCase().includes('application') ||
    reg.suspectedCause.toLowerCase().includes('external') ||
    reg.suspectedCause.toLowerCase().includes('i/o'),
    `Suspected cause must blame Application/External I/O, not Database! Got: ${reg.suspectedCause}`
  );
});
