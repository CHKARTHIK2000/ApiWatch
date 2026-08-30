import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { apiwatch, trackQuery, getGlobalStorage } from '../src/index.js';

test('2. Concurrent Request Isolation: 100+ concurrent requests with mixed queries', async () => {
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  // Route A: Slow SQL
  app.get('/req-a', async (req, res) => {
    const id = req.query.id as string;
    await trackQuery(`SELECT * FROM table_a WHERE id = '${id}'`, async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    res.json({ route: 'A', id });
  });

  // Route B: Fast SQL
  app.get('/req-b', async (req, res) => {
    const id = req.query.id as string;
    await trackQuery(`SELECT * FROM table_b WHERE id = '${id}'`, async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    res.json({ route: 'B', id });
  });

  // Route C: Multiple SQL queries (3 queries)
  app.get('/req-c', async (req, res) => {
    const id = req.query.id as string;
    await trackQuery(`SELECT * FROM table_c1 WHERE id = '${id}'`, async () => {
      await new Promise((r) => setTimeout(r, 8));
    });
    await trackQuery(`SELECT * FROM table_c2 WHERE id = '${id}'`, async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await trackQuery(`SELECT * FROM table_c3 WHERE id = '${id}'`, async () => {
      await new Promise((r) => setTimeout(r, 6));
    });
    res.json({ route: 'C', id });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const requests = [];
    const totalRequests = 120;

    for (let i = 0; i < totalRequests; i++) {
      const type = i % 3 === 0 ? 'req-a' : i % 3 === 1 ? 'req-b' : 'req-c';
      requests.push(
        fetch(`http://127.0.0.1:${port}/${type}?id=req_${i}`).then((r) => r.json())
      );
    }

    const responses = await Promise.all(requests);
    assert.strictEqual(responses.length, totalRequests);

    // Wait for all DB writes to flush
    await new Promise((r) => setTimeout(r, 150));

    const traces = getGlobalStorage().getRecentTraces(200);

    // Verify each trace's queries match ONLY its route and traceId
    for (const trace of traces) {
      if (trace.route === '/req-a') {
        assert.strictEqual(trace.queries.length, 1, 'Route A should have exactly 1 query');
        assert.ok(
          trace.queries[0].fingerprint.includes('table_a'),
          `Route A query leaked: ${trace.queries[0].fingerprint}`
        );
      } else if (trace.route === '/req-b') {
        assert.strictEqual(trace.queries.length, 1, 'Route B should have exactly 1 query');
        assert.ok(
          trace.queries[0].fingerprint.includes('table_b'),
          `Route B query leaked: ${trace.queries[0].fingerprint}`
        );
      } else if (trace.route === '/req-c') {
        assert.strictEqual(trace.queries.length, 3, 'Route C should have exactly 3 queries');
        assert.ok(
          trace.queries.every((q) => q.fingerprint.includes('table_c')),
          `Route C query leaked non-C queries`
        );
      }

      // Verify all queries in a trace share the exact traceId
      for (const q of trace.queries) {
        assert.strictEqual(
          q.traceId,
          trace.traceId,
          `Query traceId ${q.traceId} does not match request traceId ${trace.traceId}`
        );
      }
    }
  } finally {
    server.close();
  }
});

test('3. AsyncLocalStorage Stress Test: Nested async, promises, and timeouts', async () => {
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  async function serviceA(userId: string) {
    await Promise.resolve();
    return await trackQuery(`SELECT name FROM users WHERE id = '${userId}'`, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { name: 'Alice' };
    });
  }

  async function serviceB(userId: string) {
    await new Promise((r) => setTimeout(r, 15));
    return await trackQuery(`SELECT balance FROM accounts WHERE user_id = '${userId}'`, async () => {
      await Promise.resolve();
      return { balance: 500 };
    });
  }

  app.get('/nested-async', async (req, res) => {
    const userId = req.query.id as string;
    const a = await serviceA(userId);
    await new Promise((r) => setTimeout(r, 10));
    const b = await serviceB(userId);
    res.json({ a, b });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const promises = [];
    for (let i = 1; i <= 30; i++) {
      promises.push(fetch(`http://127.0.0.1:${port}/nested-async?id=user_${i}`));
    }
    await Promise.all(promises);

    await new Promise((r) => setTimeout(r, 100));

    const traces = getGlobalStorage().getRecentTraces(50, '/nested-async');
    assert.strictEqual(traces.length, 30);

    for (const t of traces) {
      assert.strictEqual(t.queries.length, 2, 'Every request must capture exactly 2 queries through nested asyncs');
      assert.ok(t.queries[0].fingerprint.includes('users'));
      assert.ok(t.queries[1].fingerprint.includes('accounts'));
    }
  } finally {
    server.close();
  }
});

test('13. Parallel Queries: Promise.all concurrency timing', async () => {
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  app.get('/parallel-queries', async (req, res) => {
    // 3 parallel queries, each taking 50ms
    const [q1, q2, q3] = await Promise.all([
      trackQuery('SELECT * FROM catalog_items WHERE category = 1', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return [1];
      }),
      trackQuery('SELECT * FROM catalog_items WHERE category = 2', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return [2];
      }),
      trackQuery('SELECT * FROM catalog_items WHERE category = 3', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return [3];
      }),
    ]);

    res.json({ q1, q2, q3 });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/parallel-queries`);
    assert.strictEqual(res.status, 200);

    await new Promise((r) => setTimeout(r, 50));

    const traces = getGlobalStorage().getRecentTraces(1, '/parallel-queries');
    assert.strictEqual(traces.length, 1);
    const trace = traces[0];

    assert.strictEqual(trace.queries.length, 3, 'All 3 parallel queries captured');
    
    // Elapsed request time should be ~50-80ms because they ran in parallel!
    assert.ok(
      trace.durationMs < 120,
      `Request should take ~50-80ms due to parallel execution, took ${trace.durationMs}ms`
    );
  } finally {
    server.close();
  }
});
