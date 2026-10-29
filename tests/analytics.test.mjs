import test from "node:test";
import assert from "node:assert/strict";
import { calculateMetrics, groupMetrics, normalizeRows, parseCsv } from "../src/analytics.mjs";

const fixture = [
  ["Order ID", "Order Date", "Dispatch Date", "Promised Delivery Date", "Actual Delivery Date", "Status", "Region", "Carrier", "Rating"],
  ["A", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z", "Delivered", "North", "Swift", "2"],
  ["B", "2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z", "2026-01-05T00:00:00Z", "2026-01-04T00:00:00Z", "Delivered", "South", "ParcelCo", "5"],
  ["C", "2026-01-01T00:00:00Z", "", "", "", "Cancelled", "North", "Swift", ""]
];

test("CSV parser preserves quoted commas, escaped quotes, and line breaks", () => {
  assert.deepEqual(parseCsv('order_id,note\nA,"late, fragile"\nB,"said ""hello"""'), [
    ["order_id", "note"],
    ["A", "late, fragile"],
    ["B", 'said "hello"']
  ]);
});

test("normalization maps common headers and excludes duplicate order IDs", () => {
  const result = normalizeRows([...fixture, fixture[1]]);
  assert.equal(result.records.length, 3);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.records[0].promised_delivery_date, "2026-01-03T00:00:00Z");
});

test("KPI definitions use eligible delivered orders and placed orders as denominators", () => {
  const { records } = normalizeRows(fixture);
  const metrics = calculateMetrics(records);
  assert.equal(metrics.orders, 3);
  assert.equal(metrics.cancelled, 1);
  assert.equal(metrics.cancellationRate, 1 / 3);
  assert.equal(metrics.delivered, 2);
  assert.equal(metrics.eligibleDelivered, 2);
  assert.equal(metrics.onTime, 1);
  assert.equal(metrics.onTimeRate, 0.5);
  assert.equal(metrics.averageDelayHours, 0);
  assert.equal(metrics.averageDeliveryHours, 36);
  assert.equal(metrics.deliveryDateCoverage, 1);
});

test("segment metrics retain order counts for comparison context", () => {
  const { records } = normalizeRows(fixture);
  const regions = groupMetrics(records, "region");
  assert.deepEqual(regions.map(({ label, orders }) => [label, orders]), [["North", 2], ["South", 1]]);
  assert.equal(regions[0].onTimeRate, 0);
});

test("KPI import requires both promised and actual delivery dates", () => {
  assert.throws(() => normalizeRows([["order_id", "actual_delivery_date"], ["A", "2026-01-01"]]), /promised and actual/);
});