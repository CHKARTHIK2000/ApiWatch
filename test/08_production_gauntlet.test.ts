import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import express from 'express';
import { apiwatch, trackQuery, getGlobalDiagnosis, getGlobalStorage } from '../src/index.js';
import { StorageEngine } from '../src/storage.js';

test('🔥 Ultimate Gauntlet: Broken Production Express App Diagnostics', async () => {
  const testDbPath = '.test_gauntlet.db';
  const app = express();
  app.use(express.json());

  // Attach ApiWatch with shared storage for isolated testing
  const storage = getGlobalStorage({ dbPath: testDbPath });
  storage.clearAllData();
  app.use(apiwatch({ dbPath: testDbPath }));

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // ==========================================
  // 1. ENDPOINTS DEFINITION
  // ==========================================

  // Failure Mode 1: True Database Query Regression
  // Query took 18ms in baseline, but 420ms today due to missing index
  app.get('/api/v1/orders/search', async (req, res) => {
    const isToday = req.query.period !== 'yesterday';
    const orders = await trackQuery(
      'SELECT * FROM orders WHERE status = ? AND amount > ? ORDER BY id DESC',
      async () => {
        await sleep(isToday ? 420 : 18);
        return [{ id: 1, status: 'PENDING', amount: 150 }];
      },
      'mysql2'
    );
    res.json({ success: true, count: orders.length });
  });

  // Failure Mode 2: Classic ORM N+1 Query Cascade
  // Fetches user, then runs 12 invoice queries in a loop
  app.get('/api/v1/users/:id/invoices', async (req, res) => {
    const userId = req.params.id;
    const user = await trackQuery(
      'SELECT id, name FROM users WHERE id = ?',
      async () => {
        await sleep(5);
        return { id: userId, name: 'John Doe' };
      },
      'pg'
    );

    const invoiceIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const items = [];

    for (const invId of invoiceIds) {
      const item = await trackQuery(
        `SELECT * FROM invoice_items WHERE invoice_id = ? AND user_id = ?`,
        async () => {
          await sleep(8);
          return { invoiceId: invId, amount: 200 };
        },
        'pg'
      );
      items.push(item);
    }

    res.json({ success: true, user, items });
  });

  // Failure Mode 3: External 3rd-Party API Bottleneck (Stripe/OAuth)
  // Database is fast (5ms), but external HTTP call takes 500ms
  app.get('/api/v1/payments/verify', async (req, res) => {
    const isToday = req.query.period !== 'yesterday';

    // Fast DB token query (always 5ms)
    await trackQuery(
      'SELECT token, account_id FROM payment_tokens WHERE id = ?',
      async () => {
        await sleep(5);
        return { token: 'tok_123', accountId: 42 };
      },
      'pg'
    );

    // External Stripe API call (Fast 20ms yesterday, slow 500ms today!)
    await sleep(isToday ? 500 : 20);

    res.json({ verified: true });
  });

  // Failure Mode 4: Compounding Multiple Slow Queries
  // Query A (+180ms) and Query B (+220ms) both regressed
  app.get('/api/v1/analytics/monthly-report', async (req, res) => {
    const isToday = req.query.period !== 'yesterday';

    const queryA = await trackQuery(
      'SELECT department_id, SUM(cost) FROM department_expenses WHERE year = ? GROUP BY department_id',
      async () => {
        await sleep(isToday ? 190 : 15);
        return [{ dept: 'Eng', cost: 50000 }];
      },
      'mysql2'
    );

    const queryB = await trackQuery(
      'SELECT product_id, COUNT(*) FROM sales_records WHERE created_at >= ? GROUP BY product_id',
      async () => {
        await sleep(isToday ? 240 : 15);
        return [{ product: 1, count: 120 }];
      },
      'mysql2'
    );

    res.json({ report: { queryA, queryB } });
  });

  // Failure Mode 5: Pure CPU Event-Loop Starvation (No SQL)
  // Baseline took 10ms, today takes 350ms CPU blocking
  app.get('/api/v1/auth/hash-heavy', async (req, res) => {
    const isToday = req.query.period !== 'yesterday';
    // Synchronous CPU work
    const start = performance.now();
    const targetMs = isToday ? 350 : 10;
    while (performance.now() - start < targetMs) {
      // Busy loop
    }
    res.json({ success: true, computeTime: targetMs });
  });

  // Failure Mode 6: Intermittent DB Deadlocks (500 Server Errors)
  app.post('/api/v1/inventory/deduct', async (req, res) => {
    const fail = req.query.fail === 'true';
    if (fail) {
      res.status(500).json({ error: 'Deadlock found when trying to get lock; try restarting transaction' });
      return;
    }

    await trackQuery(
      'UPDATE stock SET count = count - 1 WHERE item_id = ?',
      async () => {
        await sleep(15);
        return { affected: 1 };
      },
      'mysql2'
    );

    res.status(200).json({ success: true });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    console.log('\n--- 1. Seeding Historical Baseline (Yesterday) ---');

    // Seed Yesterday Baseline for /api/v1/orders/search (10 fast requests, ~25ms)
    for (let i = 1; i <= 10; i++) {
      const traceId = `tr_hist_orders_${i}`;
      const ts = now - 6 * oneHour + i * 1000;
      storage.saveRequestAndQueries(
        {
          id: traceId,
          traceId,
          method: 'GET',
          route: '/api/v1/orders/search',
          url: '/api/v1/orders/search?period=yesterday',
          statusCode: 200,
          durationMs: 25,
          queryCount: 1,
          totalSqlMs: 18,
          timestamp: ts,
        },
        [
          {
            id: `q_hist_ord_${i}`,
            traceId,
            route: '/api/v1/orders/search',
            rawSql: 'SELECT * FROM orders WHERE status = ? AND amount > ? ORDER BY id DESC',
            fingerprint: 'SELECT * FROM orders WHERE status = ? AND amount > ? ORDER BY id DESC',
            durationMs: 18,
            timestamp: ts,
            driver: 'mysql2',
          },
        ]
      );
    }

    // Seed Yesterday Baseline for /api/v1/payments/verify (10 fast requests, ~35ms)
    for (let i = 1; i <= 10; i++) {
      const traceId = `tr_hist_pay_${i}`;
      const ts = now - 6 * oneHour + i * 1000;
      storage.saveRequestAndQueries(
        {
          id: traceId,
          traceId,
          method: 'GET',
          route: '/api/v1/payments/verify',
          url: '/api/v1/payments/verify?period=yesterday',
          statusCode: 200,
          durationMs: 35,
          queryCount: 1,
          totalSqlMs: 5,
          timestamp: ts,
        },
        [
          {
            id: `q_hist_pay_${i}`,
            traceId,
            route: '/api/v1/payments/verify',
            rawSql: 'SELECT token, account_id FROM payment_tokens WHERE id = ?',
            fingerprint: 'SELECT token, account_id FROM payment_tokens WHERE id = ?',
            durationMs: 5,
            timestamp: ts,
            driver: 'pg',
          },
        ]
      );
    }

    // Seed Yesterday Baseline for /api/v1/analytics/monthly-report (10 fast requests, ~40ms)
    for (let i = 1; i <= 10; i++) {
      const traceId = `tr_hist_rep_${i}`;
      const ts = now - 6 * oneHour + i * 1000;
      storage.saveRequestAndQueries(
        {
          id: traceId,
          traceId,
          method: 'GET',
          route: '/api/v1/analytics/monthly-report',
          url: '/api/v1/analytics/monthly-report?period=yesterday',
          statusCode: 200,
          durationMs: 40,
          queryCount: 2,
          totalSqlMs: 30,
          timestamp: ts,
        },
        [
          {
            id: `q_hist_repa_${i}`,
            traceId,
            route: '/api/v1/analytics/monthly-report',
            rawSql: 'SELECT department_id, SUM(cost) FROM department_expenses WHERE year = ? GROUP BY department_id',
            fingerprint: 'SELECT department_id, SUM(cost) FROM department_expenses WHERE year = ? GROUP BY department_id',
            durationMs: 15,
            timestamp: ts,
            driver: 'mysql2',
          },
          {
            id: `q_hist_repb_${i}`,
            traceId,
            route: '/api/v1/analytics/monthly-report',
            rawSql: 'SELECT product_id, COUNT(*) FROM sales_records WHERE created_at >= ? GROUP BY product_id',
            fingerprint: 'SELECT product_id, COUNT(*) FROM sales_records WHERE created_at >= ? GROUP BY product_id',
            durationMs: 15,
            timestamp: ts,
            driver: 'mysql2',
          },
        ]
      );
    }

    // Seed Yesterday Baseline for /api/v1/auth/hash-heavy (10 fast requests, ~12ms)
    for (let i = 1; i <= 10; i++) {
      const traceId = `tr_hist_hash_${i}`;
      const ts = now - 6 * oneHour + i * 1000;
      storage.saveRequestAndQueries(
        {
          id: traceId,
          traceId,
          method: 'GET',
          route: '/api/v1/auth/hash-heavy',
          url: '/api/v1/auth/hash-heavy?period=yesterday',
          statusCode: 200,
          durationMs: 12,
          queryCount: 0,
          totalSqlMs: 0,
          timestamp: ts,
        },
        []
      );
    }

    console.log('--- 2. Executing Live Today Requests Against Broken Endpoints ---');

    // 1. Send requests to /api/v1/orders/search (Failure Mode 1)
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/v1/orders/search`);
    }

    // 2. Send requests to /api/v1/users/:id/invoices (Failure Mode 2: N+1)
    for (let i = 1; i <= 4; i++) {
      await fetch(`${baseUrl}/api/v1/users/${i}/invoices`);
    }

    // 3. Send requests to /api/v1/payments/verify (Failure Mode 3: 3rd-party bottleneck)
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/v1/payments/verify`);
    }

    // 4. Send requests to /api/v1/analytics/monthly-report (Failure Mode 4: Multi-slow queries)
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/v1/analytics/monthly-report`);
    }

    // 5. Send requests to /api/v1/auth/hash-heavy (Failure Mode 5: CPU event loop bottleneck)
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/v1/auth/hash-heavy`);
    }

    // 6. Send requests to /api/v1/inventory/deduct (Failure Mode 6: 40% 500 error rate)
    for (let i = 0; i < 10; i++) {
      const fail = i < 4; // 4 out of 10 fail = 40% error rate
      await fetch(`${baseUrl}/api/v1/inventory/deduct?fail=${fail}`, { method: 'POST' });
    }

    // Wait for event-loop finish callbacks to flush to SQLite
    await new Promise((r) => setTimeout(r, 200));

    console.log('--- 3. Verifying ApiWatch Diagnosis Engine Ground Truth ---');

    const diagnosis = getGlobalDiagnosis();
    const regressions = diagnosis.detectRegressions(2 * oneHour, 24 * oneHour);
    const nPlusOnes = diagnosis.detectNPlusOne();
    const stats = storage.getEndpointStats(0);

    // ----------------------------------------------------
    // VERIFICATION 1: True Database Query Regression
    // ----------------------------------------------------
    const orderReg = regressions.find((r) => r.route === '/api/v1/orders/search');
    assert.ok(orderReg, 'Failure Mode 1 must be flagged as a regression');
    assert.strictEqual(orderReg.severity, 'CRITICAL');
    assert.strictEqual(orderReg.topCulpritQueries.length, 1, 'Exactly 1 culprit query identified');
    assert.strictEqual(
      orderReg.topCulpritQueries[0].fingerprint,
      'SELECT * FROM orders WHERE status = ? AND amount > ? ORDER BY id DESC'
    );
    assert.ok(
      orderReg.topCulpritQueries[0].currentAvgMs >= 350,
      `Culprit query current avg should be >= 350ms, got ${orderReg.topCulpritQueries[0].currentAvgMs}ms`
    );
    assert.ok(
      orderReg.topCulpritQueries[0].contributionToLatencyPercent >= 90,
      `Database query should explain >= 90% of latency regression, got ${orderReg.topCulpritQueries[0].contributionToLatencyPercent}%`
    );
    console.log('  ✔ Failure Mode 1 (DB Query Regression) correctly diagnosed & attributed to unindexed query!');

    // ----------------------------------------------------
    // VERIFICATION 2: N+1 Query Cascade
    // ----------------------------------------------------
    const invoiceN1 = nPlusOnes.find((n) => n.route === '/api/v1/users/:id/invoices');
    assert.ok(invoiceN1, 'Failure Mode 2 must be flagged as N+1 query bottleneck');
    assert.strictEqual(
      invoiceN1.queryFingerprint,
      'SELECT * FROM invoice_items WHERE invoice_id = ? AND user_id = ?'
    );
    assert.strictEqual(invoiceN1.avgQueriesPerRequest, 12, 'Must detect exactly 12 queries per request');
    assert.ok(invoiceN1.avgTimeWastedMs > 50, `Wasted time must be > 50ms, got ${invoiceN1.avgTimeWastedMs}ms`);
    console.log('  ✔ Failure Mode 2 (N+1 Loop) correctly detected 12x loop on invoice_items!');

    // ----------------------------------------------------
    // VERIFICATION 3: External API / 3rd Party Bottleneck (DO NOT LIE)
    // ----------------------------------------------------
    const payReg = regressions.find((r) => r.route === '/api/v1/payments/verify');
    assert.ok(payReg, 'Failure Mode 3 must be detected as an endpoint regression');
    // TRUTH CHECK: Database must NOT be blamed!
    assert.strictEqual(
      payReg.topCulpritQueries.length,
      0,
      'DO NOT LIE: Database query was fast (5ms), so culprit queries must be EMPTY!'
    );
    assert.ok(
      payReg.suspectedCause.toLowerCase().includes('application') ||
      payReg.suspectedCause.toLowerCase().includes('external') ||
      payReg.suspectedCause.toLowerCase().includes('i/o'),
      `Suspected cause must indicate Application / External I/O delay, got: ${payReg.suspectedCause}`
    );
    console.log('  ✔ Failure Mode 3 (External 3rd-party API delay) diagnosed without falsely blaming the database!');

    // ----------------------------------------------------
    // VERIFICATION 4: Compounding Multiple Slow Queries
    // ----------------------------------------------------
    const reportReg = regressions.find((r) => r.route === '/api/v1/analytics/monthly-report');
    assert.ok(reportReg, 'Failure Mode 4 must be flagged as a regression');
    assert.strictEqual(reportReg.topCulpritQueries.length, 2, 'Both Query A and Query B must be identified as culprits');
    // Highest delta first: Query B (+225ms) > Query A (+175ms)
    assert.ok(reportReg.topCulpritQueries[0].fingerprint.includes('sales_records'));
    assert.ok(reportReg.topCulpritQueries[1].fingerprint.includes('department_expenses'));
    console.log('  ✔ Failure Mode 4 (Multiple compounding slow queries) accurately ranked both culprit queries!');

    // ----------------------------------------------------
    // VERIFICATION 5: Pure CPU Blocking / Event Loop Starvation
    // ----------------------------------------------------
    const hashReg = regressions.find((r) => r.route === '/api/v1/auth/hash-heavy');
    assert.ok(hashReg, 'Failure Mode 5 CPU bottleneck must be detected as regression');
    assert.strictEqual(hashReg.topCulpritQueries.length, 0, 'No SQL queries executed');
    assert.ok(
      hashReg.suspectedCause.toLowerCase().includes('application') ||
      hashReg.suspectedCause.toLowerCase().includes('cpu'),
      'Must identify CPU / Application delay'
    );
    console.log('  ✔ Failure Mode 5 (Pure CPU starvation) correctly diagnosed without SQL false-positives!');

    // ----------------------------------------------------
    // VERIFICATION 6: 500 Errors & Error Rates
    // ----------------------------------------------------
    const deductStats = stats.find((s) => s.route === '/api/v1/inventory/deduct');
    assert.ok(deductStats, 'Failure Mode 6 route must be in endpoint stats');
    assert.strictEqual(deductStats.totalRequests, 10);
    assert.strictEqual(deductStats.errorCount, 4, 'Must accurately record 4 server errors');
    assert.strictEqual(deductStats.errorRate, 40, 'Must record exact 40% error rate');
    console.log('  ✔ Failure Mode 6 (DB Deadlock 500 errors) recorded with exact 40% error rate!');

    console.log('\n🏆 ALL 6 PRODUCTION FAILURE MODES DIAGNOSED 100% TRUTHFULLY WITHOUT LYING!\n');
  } finally {
    server.close();
    storage.close();
    try {
      if (fs.existsSync('.test_gauntlet.db')) fs.unlinkSync('.test_gauntlet.db');
    } catch {}
  }
});
