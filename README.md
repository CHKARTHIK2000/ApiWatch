# 👁️ ApiWatch

> **Zero-Config Performance & Regression Debugger for Node.js**  
> *Don't just monitor how slow your API is — pinpoint exactly **WHY** it became slow.*

[![Tests](https://img.shields.io/badge/tests-29%2F29%20passing-brightgreen.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](#)
[![Overhead](https://img.shields.io/badge/Overhead-%2B0.15ms-informational.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#)

---

## ⚡ 2-Line Zero-Effort Setup

You do **NOT** need to touch or modify any of your existing routes or database queries! Simply add **2 lines** to your main server entrypoint:

```javascript
import express from 'express';
import mysql from 'mysql2/promise';
import { apiwatch, instrumentDatabaseObject } from 'node-apiwatch';

const app = express();

// ⚡ Line 1: Track all endpoints & serve dashboard at /__apiwatch
app.use(apiwatch());

// ⚡ Line 2: Auto-instrument your DB pool (Tracks ALL queries across the entire app)
export const pool = mysql.createPool({ host: 'localhost', user: 'root', database: 'mydb' });
instrumentDatabaseObject(pool, 'mysql2'); // Or 'pg' for PostgreSQL

// All your normal routes work untouched without changing a single line!
app.get('/api/users', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users'); // Automatically tracked & correlated!
  res.json(rows);
});

app.listen(3000, () => {
  console.log('Server running! Open dashboard at http://localhost:3000/__apiwatch');
});
```

*Prefer CommonJS (`require`)?*
```javascript
const { apiwatch, instrumentDatabaseObject } = require('node-apiwatch');
app.use(apiwatch());
instrumentDatabaseObject(pool, 'mysql2');
```

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
- 🎯 **Root-Cause Regression Diagnosis:** Automatically detects latency regressions (>25%) and identifies the specific SQL query responsible without false accusations.
- ⚠️ **N+1 Query Detection:** Flags repeated query patterns executed in a loop within single request lifecycles (e.g. 12 queries per request) and calculates wasted milliseconds.
- 🔍 **SQL Query Fingerprinting:** Automatically strips string literals, integers, and UUIDs (`SELECT * FROM users WHERE id = 42` ➔ `SELECT * FROM users WHERE id = ?`) to compute true P50/P90/P95/P99 latency per query pattern.
- 🔒 **Sensitive Data Protection:** Automatically redacts passwords, tokens, API keys, emails, and credit cards from recorded SQL statements.
- 🌊 **Request Waterfall Breakdown:** Visualize exact time spent in Middleware / Business Logic vs Database SQL execution.
- 📊 **Embedded Dark-Mode Dashboard:** Built-in web dashboard served at `/__apiwatch`.

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

Run the full automated test suite (29 tests):
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
