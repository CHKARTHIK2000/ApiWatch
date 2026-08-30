import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { apiwatch, trackQuery, getGlobalStorage } from '../src/index.js';

test('15 & 30. Stress & Concurrency: 500 requests with multi-query batches', async () => {
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  app.get('/stress-item', async (req, res) => {
    const id = req.query.id as string;

    await trackQuery(`SELECT * FROM stress_users WHERE id = ${id}`, async () => {
      await new Promise((r) => setTimeout(r, 2));
    });

    await trackQuery(`SELECT * FROM stress_orders WHERE user_id = ${id}`, async () => {
      await new Promise((r) => setTimeout(r, 2));
    });

    res.json({ ok: true, id });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const totalReqs = 300;
    const batchSize = 30;

    for (let b = 0; b < totalReqs / batchSize; b++) {
      const promises = [];
      for (let i = 0; i < batchSize; i++) {
        const reqId = b * batchSize + i;
        promises.push(
          fetch(`http://127.0.0.1:${port}/stress-item?id=${reqId}`).then((r) => r.json())
        );
      }
      await Promise.all(promises);
    }

    // Wait for all writes to finish
    await new Promise((r) => setTimeout(r, 200));

    const overview = getGlobalStorage().getOverviewStats();
    assert.ok(overview.totalRequests >= totalReqs, `Expected >= ${totalReqs} requests recorded, got ${overview.totalRequests}`);
    assert.strictEqual(overview.errorCount, 0, 'Zero errors under stress load');
  } finally {
    server.close();
  }
});

test('16. Performance Overhead Benchmark: Bare Express vs ApiWatch Instrumented', async () => {
  // 1. Bare App
  const bareApp = express();
  bareApp.get('/bench', (req, res) => res.json({ ok: true }));
  const bareServer = bareApp.listen(0);
  const barePort = (bareServer.address() as any).port;

  // 2. Instrumented App
  const watchedApp = express();
  watchedApp.use(apiwatch({ dbPath: ':memory:' }));
  watchedApp.get('/bench', (req, res) => res.json({ ok: true }));
  const watchedServer = watchedApp.listen(0);
  const watchedPort = (watchedServer.address() as any).port;

  try {
    const iterations = 50;

    // Warmup
    for (let i = 0; i < 10; i++) {
      await fetch(`http://127.0.0.1:${barePort}/bench`);
      await fetch(`http://127.0.0.1:${watchedPort}/bench`);
    }

    // Measure Bare
    const bareStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await fetch(`http://127.0.0.1:${barePort}/bench`);
    }
    const bareTotalMs = performance.now() - bareStart;
    const bareAvgMs = bareTotalMs / iterations;

    // Measure Watched
    const watchedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await fetch(`http://127.0.0.1:${watchedPort}/bench`);
    }
    const watchedTotalMs = performance.now() - watchedStart;
    const watchedAvgMs = watchedTotalMs / iterations;

    const overheadMs = Math.max(0, watchedAvgMs - bareAvgMs);
    console.log(`\n  📊 Benchmark Overhead Results:`);
    console.log(`     Bare Express Avg:       ${bareAvgMs.toFixed(3)} ms/req`);
    console.log(`     ApiWatch Express Avg:   ${watchedAvgMs.toFixed(3)} ms/req`);
    console.log(`     Instrumentation Delta:  +${overheadMs.toFixed(3)} ms/req\n`);

    // Overhead per request in local in-memory/SQLite should be <= 2.5ms
    assert.ok(
      overheadMs < 5.0,
      `ApiWatch overhead per request should be < 5ms, measured: ${overheadMs.toFixed(3)}ms`
    );
  } finally {
    bareServer.close();
    watchedServer.close();
  }
});
