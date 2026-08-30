import test from 'node:test';
import assert from 'node:assert';
import { normalizeSql } from '../src/normalizer.js';
import { StorageEngine } from '../src/storage.js';
import { DiagnosisEngine } from '../src/diagnosis.js';
import { trackQuerySync } from '../src/interceptors/db.js';
import { runWithContext } from '../src/context.js';
import { RequestContext } from '../src/types.js';

test('normalizeSql: properly fingerprints SQL queries', () => {
  const query1 = "SELECT * FROM users WHERE id = 42 AND email = 'alice@example.com'";
  assert.strictEqual(
    normalizeSql(query1),
    "SELECT * FROM users WHERE id = ? AND email = ?"
  );

  const query2 = "SELECT * FROM orders WHERE user_id IN (1, 2, 3, 4)";
  assert.strictEqual(
    normalizeSql(query2),
    "SELECT * FROM orders WHERE user_id IN (?)"
  );

  const query3 = "INSERT INTO logs (level, msg, created_at) VALUES ('INFO', 'User logged in', '2026-08-30');";
  assert.strictEqual(
    normalizeSql(query3),
    "INSERT INTO logs (level, msg, created_at) VALUES (?)"
  );
});

test('Context and Query Tracking: captures queries with AsyncLocalStorage', () => {
  const mockContext: RequestContext = {
    traceId: 'tr_test_123',
    method: 'GET',
    route: '/api/test',
    url: '/api/test',
    startTime: Date.now(),
    queries: [],
  };

  runWithContext(mockContext, () => {
    trackQuerySync('SELECT * FROM items WHERE id = 10', () => {
      // Simulate small query work
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      return sum;
    }, 'sqlite');

    trackQuerySync('SELECT * FROM items WHERE id = 20', () => {
      return 123;
    }, 'sqlite');
  });

  assert.strictEqual(mockContext.queries.length, 2);
  assert.strictEqual(mockContext.queries[0].fingerprint, 'SELECT * FROM items WHERE id = ?');
  assert.strictEqual(mockContext.queries[1].fingerprint, 'SELECT * FROM items WHERE id = ?');
  assert.strictEqual(mockContext.queries[0].traceId, 'tr_test_123');
});

test('Diagnosis Engine: correctly detects regression and identifies culprit query', () => {
  const storage = new StorageEngine({ dbPath: ':memory:' });
  const diagnosis = new DiagnosisEngine(storage);

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  // 1. Seed baseline data (Yesterday / 5 hours ago) - Fast 30ms requests
  for (let i = 1; i <= 10; i++) {
    const traceId = `tr_base_${i}`;
    const ts = now - 5 * oneHour + i * 1000;
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/orders',
        url: '/api/orders',
        statusCode: 200,
        durationMs: 32,
        queryCount: 1,
        totalSqlMs: 12,
        timestamp: ts,
      },
      [
        {
          id: `q_base_${i}`,
          traceId,
          route: '/api/orders',
          rawSql: `SELECT * FROM orders WHERE customer_id = ${i}`,
          fingerprint: 'SELECT * FROM orders WHERE customer_id = ?',
          durationMs: 12,
          timestamp: ts,
        },
      ]
    );
  }

  // 2. Seed current regressed data (Last 30 mins) - Slow 450ms requests due to regressed query
  for (let i = 1; i <= 10; i++) {
    const traceId = `tr_curr_${i}`;
    const ts = now - 15 * 60 * 1000 + i * 1000;
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/orders',
        url: '/api/orders',
        statusCode: 200,
        durationMs: 460,
        queryCount: 1,
        totalSqlMs: 420,
        timestamp: ts,
      },
      [
        {
          id: `q_curr_${i}`,
          traceId,
          route: '/api/orders',
          rawSql: `SELECT * FROM orders WHERE customer_id = ${i}`,
          fingerprint: 'SELECT * FROM orders WHERE customer_id = ?',
          durationMs: 420,
          timestamp: ts,
        },
      ]
    );
  }

  // Run regression detection
  const regressions = diagnosis.detectRegressions(2 * oneHour, 24 * oneHour);
  assert.strictEqual(regressions.length, 1);

  const reg = regressions[0];
  assert.strictEqual(reg.route, '/api/orders');
  assert.strictEqual(reg.severity, 'CRITICAL');
  assert.ok(reg.increasePercentage > 500, `Expected > 500% increase, got ${reg.increasePercentage}%`);
  assert.strictEqual(reg.topCulpritQueries.length, 1);
  assert.strictEqual(reg.topCulpritQueries[0].fingerprint, 'SELECT * FROM orders WHERE customer_id = ?');
  assert.strictEqual(reg.topCulpritQueries[0].currentAvgMs, 420);
  assert.strictEqual(reg.topCulpritQueries[0].baselineAvgMs, 12);
});

test('Diagnosis Engine: correctly flags N+1 query patterns', () => {
  const storage = new StorageEngine({ dbPath: ':memory:' });
  const diagnosis = new DiagnosisEngine(storage);

  const now = Date.now();

  // Create 3 requests to /api/users/:id/posts, each executing 10 single queries in a loop
  for (let reqIdx = 1; reqIdx <= 3; reqIdx++) {
    const traceId = `tr_nplus1_${reqIdx}`;
    const queries = [];

    // User lookup query
    queries.push({
      id: `q_user_${reqIdx}`,
      traceId,
      route: '/api/users/:id/posts',
      rawSql: `SELECT * FROM users WHERE id = ${reqIdx}`,
      fingerprint: 'SELECT * FROM users WHERE id = ?',
      durationMs: 5,
      timestamp: now,
    });

    // 8 Post queries in a loop
    for (let postIdx = 1; postIdx <= 8; postIdx++) {
      queries.push({
        id: `q_post_${reqIdx}_${postIdx}`,
        traceId,
        route: '/api/users/:id/posts',
        rawSql: `SELECT * FROM posts WHERE id = ${postIdx}`,
        fingerprint: 'SELECT * FROM posts WHERE id = ?',
        durationMs: 8,
        timestamp: now,
      });
    }

    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/users/:id/posts',
        url: `/api/users/${reqIdx}/posts`,
        statusCode: 200,
        durationMs: 80,
        queryCount: queries.length,
        totalSqlMs: 69,
        timestamp: now,
      },
      queries
    );
  }

  const nPlusOne = diagnosis.detectNPlusOne();
  assert.strictEqual(nPlusOne.length, 1);
  assert.strictEqual(nPlusOne[0].route, '/api/users/:id/posts');
  assert.strictEqual(nPlusOne[0].queryFingerprint, 'SELECT * FROM posts WHERE id = ?');
  assert.strictEqual(nPlusOne[0].avgQueriesPerRequest, 8);
});
