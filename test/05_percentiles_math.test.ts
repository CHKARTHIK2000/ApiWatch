import test from 'node:test';
import assert from 'node:assert';
import { StorageEngine } from '../src/storage.js';

test('23. Percentiles Mathematical Correctness & Edge Cases', () => {
  const storage = new StorageEngine({ dbPath: ':memory:' });

  // 1. Edge Case: Empty array
  assert.strictEqual(storage.calculatePercentile([], 50), 0);
  assert.strictEqual(storage.calculatePercentile([], 95), 0);

  // 2. Edge Case: Single sample [42]
  assert.strictEqual(storage.calculatePercentile([42], 0), 42);
  assert.strictEqual(storage.calculatePercentile([42], 50), 42);
  assert.strictEqual(storage.calculatePercentile([42], 95), 42);
  assert.strictEqual(storage.calculatePercentile([42], 100), 42);

  // 3. Two samples: [10, 20]
  assert.strictEqual(storage.calculatePercentile([10, 20], 0), 10);
  assert.strictEqual(storage.calculatePercentile([10, 20], 50), 15);
  assert.strictEqual(storage.calculatePercentile([10, 20], 90), 19);
  assert.strictEqual(storage.calculatePercentile([10, 20], 100), 20);

  // 4. Ten samples: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const tenSamples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const p50 = storage.calculatePercentile(tenSamples, 50);
  const p90 = storage.calculatePercentile(tenSamples, 90);
  const p95 = storage.calculatePercentile(tenSamples, 95);
  const p99 = storage.calculatePercentile(tenSamples, 99);

  assert.strictEqual(p50, 5.5, `Expected P50 to be 5.5, got ${p50}`);
  assert.strictEqual(p90, 9.1, `Expected P90 to be 9.1, got ${p90}`);
  assert.strictEqual(p95, 9.55, `Expected P95 to be 9.55, got ${p95}`);
  assert.strictEqual(p99, 9.91, `Expected P99 to be 9.91, got ${p99}`);

  // 5. Verify no NaN / Infinity for 100 samples
  const hundredSamples = Array.from({ length: 100 }, (_, i) => i + 1);
  for (let p = 0; p <= 100; p += 5) {
    const val = storage.calculatePercentile(hundredSamples, p);
    assert.ok(!isNaN(val), `Percentile ${p} returned NaN`);
    assert.ok(isFinite(val), `Percentile ${p} returned non-finite`);
    assert.ok(val >= 1 && val <= 100, `Percentile ${p} out of bounds: ${val}`);
  }
});
