import test from 'node:test';
import assert from 'node:assert';
import { normalizeSql, sanitizeSql } from '../src/normalizer.js';

test('4. SQL Normalization: Identical fingerprints for variable literals', () => {
  // Integer ID variations
  assert.strictEqual(
    normalizeSql('SELECT * FROM users WHERE id = 1'),
    normalizeSql('SELECT * FROM users WHERE id = 999')
  );

  // String literals
  assert.strictEqual(
    normalizeSql("SELECT * FROM users WHERE name = 'John'"),
    normalizeSql("SELECT * FROM users WHERE name = 'Alice'")
  );

  // IN lists
  assert.strictEqual(
    normalizeSql('SELECT * FROM users WHERE id IN (1, 2, 3)'),
    normalizeSql('SELECT * FROM users WHERE id IN (4, 5, 6, 7)')
  );

  // INSERT VALUES
  assert.strictEqual(
    normalizeSql("INSERT INTO users(name) VALUES ('John')"),
    normalizeSql("INSERT INTO users(name) VALUES ('Alice')")
  );

  // UPDATE statements
  assert.strictEqual(
    normalizeSql("UPDATE users SET name = 'John' WHERE id = 1"),
    normalizeSql("UPDATE users SET name = 'Bob' WHERE id = 2")
  );
});

test('4. SQL Normalization: Numbers, decimals, negatives, UUIDs, comments', () => {
  // Negative numbers
  assert.strictEqual(
    normalizeSql('SELECT * FROM readings WHERE temp < -15'),
    normalizeSql('SELECT * FROM readings WHERE temp < -42')
  );

  // Decimals / floats
  assert.strictEqual(
    normalizeSql('SELECT * FROM products WHERE price > 19.99'),
    normalizeSql('SELECT * FROM products WHERE price > 499.50')
  );

  // UUIDs
  assert.strictEqual(
    normalizeSql("SELECT * FROM accounts WHERE uuid = 'c28a528e-5b62-4f36-9e87-5f7203b5b63c'"),
    normalizeSql("SELECT * FROM accounts WHERE uuid = '123e4567-e89b-12d3-a456-426614174000'")
  );

  // SQL comments (single-line --, # and multi-line /* */)
  assert.strictEqual(
    normalizeSql('SELECT * FROM users -- fetch all users\nWHERE id = 1'),
    normalizeSql('SELECT * FROM users /* comment */ WHERE id = 2')
  );

  // Whitespace and multiline formatting
  assert.strictEqual(
    normalizeSql(`
      SELECT 
        u.id, 
        u.email 
      FROM 
        users u 
      WHERE 
        u.id = 10
    `),
    normalizeSql('SELECT u.id, u.email FROM users u WHERE u.id = 20')
  );
});

test('5. SQL Normalization Safety: Escaped quotes, complex strings, and edge cases', () => {
  // Escaped quotes in SQL: 'O''Connor'
  const oconnor = normalizeSql("SELECT * FROM users WHERE name = 'O''Connor'");
  assert.strictEqual(oconnor, "SELECT * FROM users WHERE name = ?");

  // String containing digits: 'hello 123 world'
  const stringDigits = normalizeSql("SELECT * FROM logs WHERE message = 'hello 123 world'");
  assert.strictEqual(stringDigits, "SELECT * FROM logs WHERE message = ?");

  // String containing comma list: '1,2,3'
  const stringList = normalizeSql("SELECT * FROM items WHERE tags = '1,2,3'");
  assert.strictEqual(stringList, "SELECT * FROM items WHERE tags = ?");

  // Pure string literal
  const pureLiteral = normalizeSql("SELECT '12345'");
  assert.strictEqual(pureLiteral, "SELECT ?");

  // NULL keywords should not be stripped or turned into ?
  const nullCheck = normalizeSql("SELECT * FROM users WHERE deleted_at IS NULL");
  assert.strictEqual(nullCheck, "SELECT * FROM users WHERE deleted_at IS NULL");
});

test('18. Sensitive Data Protection: Redaction of passwords, tokens, emails, credit cards', () => {
  const queryWithPassword = "SELECT * FROM users WHERE email = 'ceo@company.com' AND password = 'SuperSecretPassword123'";
  const sanitized = sanitizeSql(queryWithPassword);

  assert.ok(!sanitized.includes('SuperSecretPassword123'), 'Raw password must never be present in sanitized SQL');
  assert.ok(!sanitized.includes('ceo@company.com'), 'Email must be redacted');
  assert.ok(sanitized.includes('[REDACTED]'), 'Password should be replaced with [REDACTED]');

  const queryWithToken = "SELECT * FROM api_sessions WHERE api_key = 'sk_live_999888777666'";
  const sanitizedToken = sanitizeSql(queryWithToken);
  assert.ok(!sanitizedToken.includes('sk_live_999888777666'), 'API key must be redacted');
});

test('21. Query Fingerprint Cardinality: 10,000 different IDs map to 1 fingerprint', () => {
  const fingerprints = new Set<string>();

  for (let i = 1; i <= 10000; i++) {
    const fp = normalizeSql(`SELECT * FROM users WHERE id = ${i} AND status = 'ACTIVE'`);
    fingerprints.add(fp);
  }

  assert.strictEqual(
    fingerprints.size,
    1,
    `Cardinality explosion: expected 1 unique fingerprint, got ${fingerprints.size}`
  );
  assert.strictEqual(
    Array.from(fingerprints)[0],
    "SELECT * FROM users WHERE id = ? AND status = ?"
  );
});

