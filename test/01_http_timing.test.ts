import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { apiwatch, getGlobalStorage } from '../src/index.js';
import { StorageEngine } from '../src/storage.js';

test('1. HTTP Request Tracking: Basic request timing (/fast)', async () => {
  const storage = new StorageEngine({ dbPath: ':memory:' });
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  app.get('/fast', (req, res) => {
    res.status(200).json({ ok: true });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const start = performance.now();
    const res = await fetch(`http://127.0.0.1:${port}/fast`);
    const elapsed = performance.now() - start;

    assert.strictEqual(res.status, 200);

    // Allow event loop to complete response finish callback
    await new Promise((r) => setTimeout(r, 50));

    const traces = getGlobalStorage().getRecentTraces(10);
    const trace = traces.find((t) => t.route === '/fast');

    assert.ok(trace, 'Request should be recorded in storage');
    assert.strictEqual(trace.route, '/fast');
    assert.strictEqual(trace.statusCode, 200);
    assert.ok(trace.durationMs > 0, `Duration should be > 0ms, got ${trace.durationMs}ms`);
    assert.ok(trace.durationMs <= elapsed + 10, `Duration ${trace.durationMs}ms exceeds total request elapsed ${elapsed}ms`);
  } finally {
    server.close();
  }
});

test('1. HTTP Request Tracking: Slow endpoint with delay (/slow)', async () => {
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  app.get('/slow', async (req, res) => {
    await new Promise((r) => setTimeout(r, 120));
    res.status(200).send('done');
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/slow`);
    assert.strictEqual(res.status, 200);

    await new Promise((r) => setTimeout(r, 50));

    const traces = getGlobalStorage().getRecentTraces(10);
    const trace = traces.find((t) => t.route === '/slow');

    assert.ok(trace, 'Trace for /slow should exist');
    assert.ok(
      trace.durationMs >= 110 && trace.durationMs <= 250,
      `Duration should be ~120ms, got ${trace.durationMs}ms`
    );
  } finally {
    server.close();
  }
});

test('1. HTTP Request Tracking: Different status codes (200, 201, 400, 404, 500)', async () => {
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  app.get('/status/201', (req, res) => res.status(201).send('created'));
  app.get('/status/400', (req, res) => res.status(400).send('bad request'));
  app.get('/status/500', (req, res) => res.status(500).send('server error'));

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const s201 = await fetch(`http://127.0.0.1:${port}/status/201`);
    const s400 = await fetch(`http://127.0.0.1:${port}/status/400`);
    const s404 = await fetch(`http://127.0.0.1:${port}/nonexistent`);
    const s500 = await fetch(`http://127.0.0.1:${port}/status/500`);

    assert.strictEqual(s201.status, 201);
    assert.strictEqual(s400.status, 400);
    assert.strictEqual(s404.status, 404);
    assert.strictEqual(s500.status, 500);

    await new Promise((r) => setTimeout(r, 50));

    const traces = getGlobalStorage().getRecentTraces(20);
    assert.ok(traces.some((t) => t.statusCode === 201), 'Status 201 recorded');
    assert.ok(traces.some((t) => t.statusCode === 400), 'Status 400 recorded');
    assert.ok(traces.some((t) => t.statusCode === 404), 'Status 404 recorded');
    assert.ok(traces.some((t) => t.statusCode === 500), 'Status 500 recorded');
  } finally {
    server.close();
  }
});

test('1. HTTP Request Tracking: Errors thrown by Express route handlers', async () => {
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  app.get('/error-throw', (req, res, next) => {
    throw new Error('Uncaught route explosion');
  });

  // Express error handler
  app.use((err: any, req: any, res: any, next: any) => {
    res.status(500).json({ error: err.message });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/error-throw`);
    assert.strictEqual(res.status, 500);

    await new Promise((r) => setTimeout(r, 50));

    const traces = getGlobalStorage().getRecentTraces(10);
    const trace = traces.find((t) => t.route === '/error-throw');

    assert.ok(trace, 'Thrown error request was recorded');
    assert.strictEqual(trace.statusCode, 500);
    assert.ok(trace.durationMs >= 0);
  } finally {
    server.close();
  }
});

test('20. Route Normalization: Express parameterized routes', async () => {
  const app = express();
  app.use(apiwatch({ dbPath: ':memory:' }));

  app.get('/users/:id', (req, res) => res.json({ id: req.params.id }));
  app.get('/orders/:orderId/items/:itemId', (req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    await fetch(`http://127.0.0.1:${port}/users/1`);
    await fetch(`http://127.0.0.1:${port}/users/2`);
    await fetch(`http://127.0.0.1:${port}/users/999`);
    await fetch(`http://127.0.0.1:${port}/orders/123/items/5`);
    await fetch(`http://127.0.0.1:${port}/orders/456/items/9`);

    await new Promise((r) => setTimeout(r, 50));

    const stats = getGlobalStorage().getEndpointStats(0);
    const userStats = stats.filter((s) => s.route === '/users/:id');
    const orderStats = stats.filter((s) => s.route === '/orders/:orderId/items/:itemId');

    assert.strictEqual(userStats.length, 1, 'Normalized route /users/:id should be 1 endpoint entry');
    assert.strictEqual(userStats[0].totalRequests, 3, 'Should have 3 requests for /users/:id');

    assert.strictEqual(orderStats.length, 1, 'Normalized nested route should be 1 endpoint entry');
    assert.strictEqual(orderStats[0].totalRequests, 2, 'Should have 2 requests for /orders/:orderId/items/:itemId');
  } finally {
    server.close();
  }
});
