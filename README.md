# 👁️ ApiWatch

> **Zero-Config Performance & Regression Debugger for Node.js**  
> *Don't just monitor how slow your API is — pinpoint exactly **WHY** it became slow.*

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#)

---

## 💡 The Core Problem

Traditional APMs (Datadog, New Relic) cost hundreds of dollars and drown you in raw graphs. Traditional loggers (Pino, Winston) only spit isolated lines into console logs without statistical time-series aggregations.

When an endpoint degrades:
> *"Yesterday `/api/orders` took 35ms. Today it takes 480ms. Why?"*

**ApiWatch** automatically correlates incoming HTTP requests with all database queries executed during their lifecycle using `AsyncLocalStorage`, compares today's P95 latency against your historical baseline, and pinpoints the exact culprit:

```text
🔴 Performance Regression Detected on GET /api/orders (+1,041% slowdown)

Baseline P95: 34ms  ➔  Today's P95: 394ms (+360ms)

Suspected Root Cause:
└── Database Query: SELECT o.*, u.name, p.title FROM orders o JOIN users...
    ├── Baseline Avg: 20ms
    ├── Today's Avg:  389ms  🔴 (+1,832%)
    └── Latency Impact: 100% of request regression

Actionable Recommendations:
• Inspect EXPLAIN plan for query
• Verify index on `orders.created_at` and JOIN columns
• Check if table row count increased without adequate indexing
```

---

## ✨ Features

- ⚡ **Zero External Infrastructure:** Powered by embedded SQLite (`.apiwatch.db` via Node's native SQLite) — no Docker containers, no Redis, no Grafana setups needed.
- 🎯 **Root-Cause Regression Diagnosis:** Automatically detects latency regressions (>25%) and identifies the specific SQL query responsible.
- ⚠️ **N+1 Query Detection:** Flags repeated query patterns executed in a loop within single request lifecycles (e.g. 8 queries per request) and calculates wasted milliseconds.
- 🔍 **SQL Query Fingerprinting:** Automatically strips string literals, integers, and UUIDs (`SELECT * FROM users WHERE id = 42` ➔ `SELECT * FROM users WHERE id = ?`) to compute true P50/P90/P95/P99 latency per query pattern.
- 🌊 **Request Waterfall Breakdown:** Visualize exact time spent in Middleware / Business Logic vs Database SQL execution.
- 📊 **Embedded Dark-Mode Dashboard:** Built-in web dashboard served at `/__apiwatch`.

---

## 📦 Quickstart

### 1. Install

```bash
npm install apiwatch
```

### 2. Plug into Express

```typescript
import express from 'express';
import { apiwatch, trackQuery } from 'apiwatch';

const app = express();

// 1. Register middleware (mounts dashboard at /__apiwatch)
app.use(apiwatch());

// 2. Track queries using trackQuery wrapper or auto-instrumentation
app.get('/api/users', async (req, res) => {
  const users = await trackQuery('SELECT * FROM users LIMIT 20', async () => {
    return await db.query('SELECT * FROM users LIMIT 20');
  }, 'pg');

  res.json(users);
});

app.listen(3000, () => {
  console.log('Server running! Open dashboard at http://localhost:3000/__apiwatch');
});
```

---

## 🛠️ Auto-Instrumenting DB Pools (MySQL / Postgres)

Instead of wrapping queries manually, you can auto-instrument your database pool or connection:

```typescript
import { instrumentDatabaseObject } from 'apiwatch';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({ ... });
instrumentDatabaseObject(pool, 'mysql2');
```

---

## 🖥️ Interactive Web Dashboard

Navigating to `http://localhost:3000/__apiwatch` provides:
1. **Regression Diagnosis Feed:** Root-cause alerts with culprit query breakdowns and actionable tuning advice.
2. **N+1 Loop Analyzer:** Real-time detection of looped DB queries with wasted latency metrics.
3. **Endpoint Analytics:** Method, route, total requests, P50, P90, P95, P99, error rates, and query count per request.
4. **Query Performance Table:** Top time-consuming query fingerprints across all endpoints.
5. **Request Trace Waterfall:** Inspect individual request timelines with exact SQL statements.

---

## ⚙️ Configuration Options

```typescript
app.use(
  apiwatch({
    /** Path to local SQLite file (default: '.apiwatch.db') */
    dbPath: '.apiwatch.db',
    /** Custom dashboard endpoint (default: '/__apiwatch') */
    dashboardPath: '/__apiwatch',
    /** Optional secret token for dashboard access (?token=...) */
    secretToken: process.env.APIWATCH_SECRET,
    /** Slow request threshold in ms to highlight (default: 250) */
    slowRequestThresholdMs: 250,
  })
);
```

---

## 🧪 Testing & Demo

Run the full automated test suite:
```bash
npm test
```

Run the live demo server and traffic simulator:
```bash
# Terminal 1: Start Demo Server
npm run demo

# Terminal 2: Run Traffic Simulator
npm run simulate
```
Open `http://localhost:4321/__apiwatch` to inspect live data.

---

## 📜 License
MIT License
