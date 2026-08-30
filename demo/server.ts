import express from 'express';
import { apiwatch, trackQuery } from '../src/index.js';

const app = express();
const PORT = process.env.PORT || 4321;

// Enable ApiWatch middleware (serves dashboard at /__apiwatch)
app.use(
  apiwatch({
    dbPath: '.apiwatch.db',
    dashboardPath: '/__apiwatch',
  })
);

app.use(express.json());

// Helper to simulate asynchronous DB latency
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 1. Healthy Fast Route
 */
app.get('/api/users', async (req, res) => {
  const users = await trackQuery(
    'SELECT id, name, email, role FROM users LIMIT 50',
    async () => {
      await sleep(15);
      return [
        { id: 1, name: 'Alice Cooper', email: 'alice@example.com', role: 'admin' },
        { id: 2, name: 'Bob Dylan', email: 'bob@example.com', role: 'user' },
      ];
    },
    'pg'
  );

  res.json({ success: true, data: users });
});

/**
 * 2. Healthy Parameterized Route
 */
app.get('/api/products/:id', async (req, res) => {
  const productId = req.params.id;

  const product = await trackQuery(
    `SELECT * FROM products WHERE id = ${productId} AND is_active = 1`,
    async () => {
      await sleep(22);
      return { id: productId, name: 'Wireless Headphones', price: 99.99 };
    },
    'mysql2'
  );

  res.json({ success: true, data: product });
});

/**
 * 3. Regressed Route (Simulates slow query / missing index)
 * Supports query param `mode=fast` or `mode=slow` (default slow)
 */
app.get('/api/orders', async (req, res) => {
  const isFast = req.query.mode === 'fast';

  const orders = await trackQuery(
    'SELECT o.*, u.name, p.title FROM orders o JOIN users u ON o.user_id = u.id JOIN products p ON o.product_id = p.id WHERE o.created_at >= ? ORDER BY o.id DESC',
    async () => {
      // Fast baseline takes 20ms, slow regression takes 380ms
      await sleep(isFast ? 20 : 380);
      return [{ id: 101, total: 249.99, status: 'PAID' }];
    },
    'mysql2'
  );

  res.json({ success: true, count: orders.length, orders });
});

/**
 * 4. N+1 Query Route (Fetches a user, then executes a separate query for each post in a loop)
 */
app.get('/api/users/:id/posts', async (req, res) => {
  const userId = req.params.id;

  // 1. Initial query to fetch user
  const user = await trackQuery(
    `SELECT * FROM users WHERE id = ${userId}`,
    async () => {
      await sleep(8);
      return { id: userId, name: 'Charlie Brown' };
    },
    'pg'
  );

  // 2. N+1 Loop: Executes 8 queries in a loop instead of a single JOIN / WHERE IN (?)
  const postIds = [101, 102, 103, 104, 105, 106, 107, 108];
  const posts = [];

  for (const postId of postIds) {
    const post = await trackQuery(
      `SELECT * FROM posts WHERE id = ${postId} AND author_id = ${userId}`,
      async () => {
        await sleep(10);
        return { id: postId, title: `Post #${postId}`, authorId: userId };
      },
      'pg'
    );
    posts.push(post);
  }

  res.json({ success: true, user, posts });
});

/**
 * 5. Intermittent 500 Error / Lock Timeout
 */
app.get('/api/checkout', async (req, res) => {
  const fail = Math.random() < 0.3; // 30% failure rate
  if (fail) {
    await sleep(40);
    res.status(500).json({ error: 'Database transaction lock timeout' });
    return;
  }

  await trackQuery(
    'UPDATE accounts SET balance = balance - 100 WHERE id = 1',
    async () => {
      await sleep(45);
      return { affectedRows: 1 };
    },
    'pg'
  );

  res.json({ success: true, status: 'COMPLETED' });
});

// Root welcome
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: system-ui; max-width: 600px; margin: 40px auto; line-height: 1.6;">
        <h2>👁️ ApiWatch Demo Server Running</h2>
        <p>Explore the live performance dashboard at: <a href="/__apiwatch" style="color: #4f46e5; font-weight: bold;">http://localhost:${PORT}/__apiwatch</a></p>
        <h4>Available Test Routes:</h4>
        <ul>
          <li><a href="/api/users">GET /api/users</a> (Healthy ~15ms)</li>
          <li><a href="/api/products/42">GET /api/products/42</a> (Healthy ~22ms)</li>
          <li><a href="/api/orders">GET /api/orders</a> (Regressed slow query ~380ms)</li>
          <li><a href="/api/users/5/posts">GET /api/users/5/posts</a> (N+1 Query loop)</li>
          <li><a href="/api/checkout">GET /api/checkout</a> (Intermittent 500 failure)</li>
        </ul>
      </body>
    </html>
  `);
});

const server = app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 ApiWatch Demo Server listening on http://localhost:${PORT}`);
  console.log(`📊 Open Dashboard at: http://localhost:${PORT}/__apiwatch`);
  console.log(`======================================================\n`);
});

// Ensure process stays alive
setInterval(() => {}, 1 << 30);

