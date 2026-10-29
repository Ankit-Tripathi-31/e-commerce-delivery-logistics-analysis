const aliases = {
  order_id: ["order_id", "orderid", "order_number", "shipment_id", "id"],
  order_date: ["order_date", "order_created_at", "purchase_date", "created_at"],
  dispatch_date: ["dispatch_date", "dispatch_at", "ship_date", "shipped_date", "shipped_at"],
  promised_delivery_date: ["promised_delivery_date", "promised_date", "expected_delivery_date", "estimated_delivery_date", "eta"],
  actual_delivery_date: ["actual_delivery_date", "actual_date", "delivered_at", "delivery_date"],
  order_status: ["order_status", "delivery_status", "status"],
  cancellation_status: ["cancellation_status", "cancelled", "canceled"],
  region: ["region", "destination_region"],
  carrier: ["carrier", "courier", "delivery_partner"],
  product_category: ["product_category", "category"],
  distance_band: ["distance_band", "route_distance_band"],
  customer_rating: ["customer_rating", "rating", "review_score"]
};

const normalizeHeader = (value) => value
  .replace(/^\uFEFF/, "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_|_$/g, "");

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function normalizeRows(csvRows) {
  if (csvRows.length < 2) throw new Error("The CSV needs a header row and at least one order.");

  const headers = csvRows[0].map(normalizeHeader);
  const mappedColumns = Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((header) => names.includes(header))])
  );
  if (mappedColumns.promised_delivery_date < 0 || mappedColumns.actual_delivery_date < 0) {
    throw new Error("Add promised and actual delivery date columns to calculate delivery KPIs.");
  }

  const seenIds = new Set();
  let duplicateCount = 0;
  const records = csvRows.slice(1).map((cells, rowIndex) => {
    const record = Object.fromEntries(Object.entries(mappedColumns).map(([field, column]) => [
      field,
      column < 0 ? "" : (cells[column] ?? "").trim()
    ]));
    record._rowNumber = rowIndex + 2;
    if (record.order_id) {
      if (seenIds.has(record.order_id)) {
        duplicateCount += 1;
        return null;
      }
      seenIds.add(record.order_id);
    }
    return record;
  }).filter(Boolean);

  if (records.length === 0) throw new Error("No usable order rows were found.");
  return { records, duplicateCount, headers };
}

const timestamp = (value) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const isCancelled = (record) => /cancel/i.test(record.order_status)
  || /^(true|yes|1|cancelled|canceled)$/i.test(record.cancellation_status);

const isDelivered = (record) => !isCancelled(record)
  && (/deliver|complete|fulfilled/i.test(record.order_status) || timestamp(record.actual_delivery_date) !== null);

const hoursBetween = (start, end) => {
  const first = timestamp(start);
  const last = timestamp(end);
  return first === null || last === null ? null : (last - first) / 3_600_000;
};

function metricsFor(records) {
  const cancelled = records.filter(isCancelled);
  const delivered = records.filter(isDelivered);
  const comparable = delivered.filter((record) => hoursBetween(record.promised_delivery_date, record.actual_delivery_date) !== null);
  const onTime = comparable.filter((record) => hoursBetween(record.promised_delivery_date, record.actual_delivery_date) <= 0);
  const delays = comparable.map((record) => hoursBetween(record.promised_delivery_date, record.actual_delivery_date));
  const durations = delivered.map((record) => hoursBetween(record.dispatch_date, record.actual_delivery_date)).filter((hours) => hours !== null);
  const processing = records.map((record) => hoursBetween(record.order_date, record.dispatch_date)).filter((hours) => hours !== null);
  const ratings = delivered.map((record) => Number(record.customer_rating)).filter(Number.isFinite);

  return {
    orders: records.length,
    delivered: delivered.length,
    cancelled: cancelled.length,
    eligibleDelivered: comparable.length,
    onTime: onTime.length,
    onTimeRate: comparable.length ? onTime.length / comparable.length : null,
    cancellationRate: records.length ? cancelled.length / records.length : null,
    averageDelayHours: delays.length ? delays.reduce((sum, hours) => sum + hours, 0) / delays.length : null,
    averageDeliveryHours: durations.length ? durations.reduce((sum, hours) => sum + hours, 0) / durations.length : null,
    deliveryDurationCount: durations.length,
    averageProcessingHours: processing.length ? processing.reduce((sum, hours) => sum + hours, 0) / processing.length : null,
    ratingAverage: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    ratingCount: ratings.length,
    deliveryDateCoverage: delivered.length ? comparable.length / delivered.length : null
  };
}

export function groupMetrics(records, field) {
  const groups = new Map();
  for (const record of records) {
    const label = record[field]?.trim();
    if (!label) continue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(record);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({ label, ...metricsFor(group) }))
    .sort((left, right) => (right.orders - left.orders) || left.label.localeCompare(right.label));
}

export function calculateMetrics(records) {
  return metricsFor(records);
}

export { hoursBetween, isCancelled, isDelivered };