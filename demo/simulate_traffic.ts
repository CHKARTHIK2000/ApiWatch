import { StorageEngine } from '../src/storage.js';

async function seedHistoryAndSimulateTraffic() {
  const PORT = process.env.PORT || 4321;
  const BASE_URL = `http://localhost:${PORT}`;

  console.log('📡 Seeding historical baseline metrics into SQLite storage...');
  const storage = new StorageEngine({ dbPath: '.apiwatch.db' });
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  // 1. Seed Historical Baseline (Yesterday / 5 hours ago)
  // Historical /api/orders was fast (avg 25ms, query 18ms)
  for (let i = 1; i <= 25; i++) {
    const traceId = `tr_hist_orders_${now}_${i}`;
    const ts = now - 6 * oneHour + i * 2000;
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/orders',
        url: '/api/orders',
        statusCode: 200,
        durationMs: 28 + Math.floor(Math.random() * 8),
        queryCount: 1,
        totalSqlMs: 18 + Math.floor(Math.random() * 5),
        timestamp: ts,
      },
      [
        {
          id: `q_hist_orders_${now}_${i}`,
          traceId,
          route: '/api/orders',
          rawSql: 'SELECT o.*, u.name, p.title FROM orders o JOIN users u ON o.user_id = u.id JOIN products p ON o.product_id = p.id WHERE o.created_at >= ? ORDER BY o.id DESC',
          fingerprint: 'SELECT o.*, u.name, p.title FROM orders o JOIN users u ON o.user_id = u.id JOIN products p ON o.product_id = p.id WHERE o.created_at >= ? ORDER BY o.id DESC',
          durationMs: 18 + Math.floor(Math.random() * 5),
          timestamp: ts,
          driver: 'mysql2',
        },
      ]
    );
  }

  // Historical /api/users
  for (let i = 1; i <= 20; i++) {
    const traceId = `tr_hist_users_${now}_${i}`;
    const ts = now - 6 * oneHour + i * 2000;
    storage.saveRequestAndQueries(
      {
        id: traceId,
        traceId,
        method: 'GET',
        route: '/api/users',
        url: '/api/users',
        statusCode: 200,
        durationMs: 16 + Math.floor(Math.random() * 4),
        queryCount: 1,
        totalSqlMs: 14 + Math.floor(Math.random() * 3),
        timestamp: ts,
      },
      [
        {
          id: `q_hist_users_${now}_${i}`,
          traceId,
          route: '/api/users',
          rawSql: 'SELECT id, name, email, role FROM users LIMIT 50',
          fingerprint: 'SELECT id, name, email, role FROM users LIMIT ?',
          durationMs: 14 + Math.floor(Math.random() * 3),
          timestamp: ts,
          driver: 'pg',
        },
      ]
    );
  }

  console.log('✅ Baseline historical metrics seeded successfully.');
  console.log(`\n🚀 Now generating live requests to ${BASE_URL}...\n`);

  const endpoints = [
    '/api/users',
    '/api/products/10',
    '/api/products/42',
    '/api/orders', // Slow regressed endpoint!
    '/api/users/3/posts', // N+1 query loop!
    '/api/checkout', // 30% error rate
  ];

  for (let round = 1; round <= 5; round++) {
    console.log(`[Batch ${round}/5] Sending requests across all endpoints...`);
    await Promise.all(
      endpoints.map(async (path) => {
        try {
          const res = await fetch(`${BASE_URL}${path}`);
          console.log(`  ➔ GET ${path.padEnd(20)} [${res.status}]`);
        } catch (err: any) {
          console.error(`  ✖ Failed to call ${path}: ${err.message}`);
        }
      })
    );
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('\n🎉 Traffic simulation complete!');
  console.log(`👉 Open http://localhost:${PORT}/__apiwatch to view regression diagnosis & N+1 analysis!`);
}

seedHistoryAndSimulateTraffic().catch(console.error);
