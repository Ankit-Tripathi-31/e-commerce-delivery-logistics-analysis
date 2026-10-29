import { calculateMetrics, groupMetrics, normalizeRows, parseCsv } from "./analytics.mjs";

const $ = (selector) => document.querySelector(selector);
const elements = {
  sourceBanner: $("#source-banner"),
  sourceCount: $("#source-count"),
  importMessage: $("#import-message"),
  period: $("#period-filter"),
  region: $("#region-filter"),
  carrier: $("#carrier-filter"),
  trend: $("#trend-chart"),
  recommendations: $("#recommendations"),
  carrierComparison: $("#carrier-comparison"),
  regionComparison: $("#region-comparison"),
  carrierTable: $("#carrier-table")
};

const state = { records: [], origin: "synthetic demo", duplicateCount: 0 };
const numberFormat = new Intl.NumberFormat("en-US");
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const themeStorageKey = "fieldnote-theme";
const escaped = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

function readThemePreference() {
  try {
    return localStorage.getItem(themeStorageKey);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  const isNight = theme === "night";
  document.documentElement.dataset.theme = isNight ? "night" : "day";
  const toggle = $("#theme-toggle");
  toggle.setAttribute("aria-pressed", String(isNight));
  toggle.setAttribute("aria-label", `Switch to ${isNight ? "day" : "night"} mode`);
  toggle.title = `Switch to ${isNight ? "day" : "night"} mode`;
  $("#theme-label").textContent = isNight ? "Day mode" : "Night mode";
  toggle.querySelector(".theme-icon").textContent = isNight ? "☼" : "☾";
  document.querySelector('meta[name="theme-color"]').content = isNight ? "#101816" : "#f5f6f2";
}

const savedTheme = readThemePreference();
applyTheme(savedTheme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day"));
$("#theme-toggle").addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "night" ? "day" : "night";
  applyTheme(nextTheme);
  try {
    localStorage.setItem(themeStorageKey, nextTheme);
  } catch {
    return;
  }
});

function makeDemoRecords() {
  const regions = ["North", "South", "East", "West"];
  const carriers = ["SwiftCart", "ParcelPro", "BlueDart", "ShipNow"];
  const records = [];
  const today = new Date();
  const baseDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 10 * 86_400_000;

  for (let index = 0; index < 280; index += 1) {
    const dayOffset = (index * 37 + Math.floor(index / 4) * 11) % 80;
    const orderDate = new Date(baseDay - dayOffset * 86_400_000 + (index % 10) * 3_600_000);
    const regionIndex = (index * 3 + Math.floor(index / 7)) % regions.length;
    const carrierIndex = (index * 5 + Math.floor(index / 9)) % carriers.length;
    const cancellation = index % 17 === 0 || index % 43 === 0;
    const inTransit = !cancellation && index % 29 === 0;
    const promisedDays = 2 + ((index * 7) % 5);
    const dispatchHours = 8 + ((index * 13) % 34);
    const bias = [0.2, 0.7, -0.15, 0.45][carrierIndex] + [0.2, -0.1, 0.35, -0.2][regionIndex];
    const delayDays = ((index * 19) % 13) / 5 - 1.05 + bias;
    const promise = new Date(orderDate.getTime() + promisedDays * 86_400_000);
    const dispatch = new Date(orderDate.getTime() + dispatchHours * 3_600_000);
    const actual = cancellation || inTransit ? null : new Date(promise.getTime() + delayDays * 86_400_000);
    const rating = actual ? Math.max(1, Math.min(5, Math.round(4.7 - Math.max(0, delayDays) * 1.1 + ((index % 5) - 2) * 0.28))) : "";

    records.push({
      order_id: `DEMO-${String(index + 1).padStart(4, "0")}`,
      order_date: orderDate.toISOString(),
      dispatch_date: cancellation ? "" : dispatch.toISOString(),
      promised_delivery_date: cancellation ? "" : promise.toISOString(),
      actual_delivery_date: actual?.toISOString() ?? "",
      order_status: cancellation ? "Cancelled" : inTransit ? "In transit" : "Delivered",
      cancellation_status: cancellation ? "yes" : "no",
      region: regions[regionIndex],
      carrier: carriers[carrierIndex],
      product_category: ["Electronics", "Home", "Apparel", "Beauty"][index % 4],
      distance_band: ["0-5 km", "5-15 km", "15-30 km"][index % 3],
      customer_rating: String(rating)
    });
  }
  return records;
}

function formatPercent(value) {
  return value === null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatHours(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 48) return `${(value / 24).toFixed(1)} days`;
  return `${value.toFixed(1)} hrs`;
}

function formatRating(value) {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)} / 5`;
}

function updateFilterOptions(select, field, defaultLabel) {
  const current = select.value;
  const values = [...new Set(state.records.map((record) => record[field]?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="all">${defaultLabel}</option>${values.map((value) => `<option value="${escaped(value)}">${escaped(value)}</option>`).join("")}`;
  select.value = values.includes(current) ? current : "all";
}

function filteredRecords() {
  const validOrderDates = state.records.map((record) => Date.parse(record.order_date)).filter(Number.isFinite);
  const latest = validOrderDates.length ? Math.max(...validOrderDates) : null;
  const days = elements.period.value === "all" ? null : Number(elements.period.value);
  const cutoff = days && latest !== null ? latest - days * 86_400_000 : null;

  return state.records.filter((record) => {
    if (elements.region.value !== "all" && record.region !== elements.region.value) return false;
    if (elements.carrier.value !== "all" && record.carrier !== elements.carrier.value) return false;
    const orderTime = Date.parse(record.order_date);
    return cutoff === null || !Number.isFinite(orderTime) || orderTime >= cutoff;
  });
}

function setKpi(id, value, detail) {
  $(`#${id}`).textContent = value;
  $(`#${id}-detail`).textContent = detail;
}

function renderKpis(records) {
  const metrics = calculateMetrics(records);
  setKpi("kpi-ontime", formatPercent(metrics.onTimeRate), `${numberFormat.format(metrics.onTime)} of ${numberFormat.format(metrics.eligibleDelivered)} eligible deliveries`);
  setKpi("kpi-duration", formatHours(metrics.averageDeliveryHours), `${numberFormat.format(metrics.deliveryDurationCount)} deliveries with both timestamps`);
  setKpi("kpi-cancel", formatPercent(metrics.cancellationRate), `${numberFormat.format(metrics.cancelled)} of ${numberFormat.format(metrics.orders)} placed orders`);
  setKpi("kpi-rating", formatRating(metrics.ratingAverage), `${numberFormat.format(metrics.ratingCount)} rated deliveries`);
  $("#coverage-value").textContent = formatPercent(metrics.deliveryDateCoverage);
  elements.sourceCount.textContent = `${numberFormat.format(records.length)} orders in view`;
}

function weekStart(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}

function buildTrendData(records) {
  const buckets = new Map();
  for (const record of records) {
    if (!record.actual_delivery_date || !record.promised_delivery_date) continue;
    const actualTime = Date.parse(record.actual_delivery_date);
    if (!Number.isFinite(actualTime)) continue;
    const start = weekStart(actualTime);
    const key = start.toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(record);
  }
  return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-12).map(([key, group]) => ({
    date: new Date(`${key}T00:00:00Z`),
    metrics: calculateMetrics(group)
  }));
}

function renderTrend(records) {
  const points = buildTrendData(records).filter((point) => point.metrics.onTimeRate !== null);
  if (points.length < 2) {
    elements.trend.innerHTML = '<div class="chart-empty">Not enough dated deliveries to show a weekly trend.</div>';
    $("#trend-sample").textContent = "";
    return;
  }

  const width = 720;
  const height = 190;
  const left = 43;
  const right = 12;
  const top = 14;
  const bottom = 28;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index) => left + (index / (points.length - 1)) * chartWidth;
  const y = (rate) => top + (1 - rate) * chartHeight;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.metrics.onTimeRate).toFixed(1)}`).join(" ");
  const yTicks = [1, 0.75, 0.5, 0.25, 0];
  const grid = yTicks.map((tick) => `<g><line class="${tick === 0.95 ? "chart-target" : "chart-grid"}" x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}"/><text class="chart-label" x="${left - 8}" y="${y(tick) + 3}" text-anchor="end">${Math.round(tick * 100)}%</text></g>`).join("");
  const target = `<line class="chart-target" x1="${left}" x2="${width - right}" y1="${y(0.95)}" y2="${y(0.95)}"/>`;
  const circles = points.map((point, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(point.metrics.onTimeRate)}" r="4"><title>${dateFormat.format(point.date)}: ${formatPercent(point.metrics.onTimeRate)} (${point.metrics.eligibleDelivered} eligible orders)</title></circle>`).join("");
  const labels = points.map((point, index) => index % Math.ceil(points.length / 6) === 0 || index === points.length - 1
    ? `<text class="chart-label" x="${x(index)}" y="${height - 6}" text-anchor="middle">${dateFormat.format(point.date)}</text>` : "").join("");
  elements.trend.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" preserveAspectRatio="none">${grid}${target}<path class="chart-line" d="${path}"/>${circles}${labels}</svg>`;
  const eligible = points.reduce((sum, point) => sum + point.metrics.eligibleDelivered, 0);
  $("#trend-sample").textContent = `${numberFormat.format(eligible)} eligible deliveries`;
}

function renderComparison(container, groups) {
  if (!groups.length) {
    container.innerHTML = '<p class="empty-segment">No segment values in this view.</p>';
    return;
  }
  container.innerHTML = groups.map((group) => {
    const rate = group.onTimeRate;
    const width = rate === null ? 0 : Math.max(0, Math.min(100, rate * 100));
    const lowSample = group.eligibleDelivered < 10;
    const percentage = rate === null ? "—" : formatPercent(rate);
    return `<div class="comparison-row"><span class="comparison-name" title="${escaped(group.label)}">${escaped(group.label)}</span><div class="bar-track" aria-label="${percentage} on time"><div class="bar-fill${lowSample ? " low" : ""}" style="width:${width}%"></div></div><span class="comparison-value">${percentage}${lowSample ? '<span class="sample-flag">LOW N</span>' : ""}<small>${group.delivered} / ${group.eligibleDelivered} · ${group.orders} orders</small></span></div>`;
  }).join("");
}

function renderTable(groups) {
  if (!groups.length) {
    elements.carrierTable.innerHTML = '<tr><td class="table-empty" colspan="6">No carrier data for this view.</td></tr>';
    return;
  }
  elements.carrierTable.innerHTML = groups.map((group) => `<tr><td>${escaped(group.label)}</td><td>${numberFormat.format(group.orders)}</td><td class="table-rate">${formatPercent(group.onTimeRate)}${group.eligibleDelivered < 10 ? '<span class="sample-flag">LOW N</span>' : ""}</td><td>${formatHours(group.averageDelayHours)}</td><td>${formatPercent(group.cancellationRate)}</td><td>${formatRating(group.ratingAverage)}</td></tr>`).join("");
}

function renderRecommendations(records, metrics, carriers, regions) {
  const items = [];
  if (!records.length) {
    items.push("No orders match the selected filters. Clear a filter or expand the reporting period.");
  } else if (metrics.eligibleDelivered < 10) {
    items.push(`Only ${metrics.eligibleDelivered} delivered orders have both dates. Treat the on-time rate as an early signal and improve date coverage before comparing teams.`);
  } else {
    const eligibleGroups = [...carriers, ...regions].filter((group) => group.eligibleDelivered >= 10 && group.onTimeRate !== null);
    const weakest = eligibleGroups.sort((left, right) => left.onTimeRate - right.onTimeRate)[0];
    if (weakest && weakest.onTimeRate < 0.95) {
      items.push(`<strong>${escaped(weakest.label)}</strong> has the lowest on-time rate among segments with at least 10 eligible deliveries (${formatPercent(weakest.onTimeRate)}). Review late-order reasons before reallocating volume.`);
    } else {
      items.push("No carrier or region with at least 10 eligible deliveries is below the 95% reference. Keep monitoring before changing allocation.");
    }
    if (metrics.cancellationRate !== null && metrics.cancellationRate > 0.05) {
      items.push(`Cancellation is ${formatPercent(metrics.cancellationRate)}. Break it down by cancellation reason and order stage; this dataset does not identify causes.`);
    } else {
      items.push(`Cancellation is ${formatPercent(metrics.cancellationRate)} of placed orders. Check reason codes and pre-dispatch timing to identify preventable cases.`);
    }
    if (metrics.deliveryDateCoverage !== null && metrics.deliveryDateCoverage < 0.9) {
      items.push(`Only ${formatPercent(metrics.deliveryDateCoverage)} of delivered orders have both promise and actual dates. Improve timestamp capture before treating the service rate as representative.`);
    } else {
      items.push(`Date coverage is ${formatPercent(metrics.deliveryDateCoverage)}. Audit missing promised dates and delivery scans so the rate remains comparable over time.`);
    }
  }
  elements.recommendations.innerHTML = items.slice(0, 3).map((text, index) => `<div class="recommendation"><span class="rec-number">0${index + 1}</span><p>${text}</p></div>`).join("");
}

function render() {
  const records = filteredRecords();
  const metrics = calculateMetrics(records);
  const carriers = groupMetrics(records, "carrier");
  const regions = groupMetrics(records, "region");
  renderKpis(records);
  renderTrend(records);
  renderComparison(elements.carrierComparison, carriers);
  renderComparison(elements.regionComparison, regions);
  renderTable(carriers);
  renderRecommendations(records, metrics, carriers, regions);
  const orderDates = records.map((record) => Date.parse(record.order_date)).filter(Number.isFinite).sort((a, b) => a - b);
  $("#footer-period").textContent = orderDates.length
    ? `Reporting window: ${dateFormat.format(new Date(orderDates[0]))} – ${dateFormat.format(new Date(orderDates.at(-1)))}`
    : "Reporting window: order dates unavailable";
}

function setRecords(records, origin, duplicateCount = 0) {
  state.records = records;
  state.origin = origin;
  state.duplicateCount = duplicateCount;
  const isDemo = origin === "synthetic demo";
  elements.sourceBanner.classList.toggle("is-upload", !isDemo);
  elements.sourceBanner.querySelector("strong").textContent = isDemo ? "Synthetic demonstration data" : `CSV data · ${origin}`;
  elements.sourceBanner.querySelector(":scope > div > span").textContent = isDemo
    ? "Not a real operating result. Import your order-level CSV to replace it."
    : `${numberFormat.format(records.length)} usable orders${duplicateCount ? ` · ${duplicateCount} duplicate rows skipped` : ""}.`;
  updateFilterOptions(elements.region, "region", "All regions");
  updateFilterOptions(elements.carrier, "carrier", "All carriers");
  render();
}

function exportReport() {
  const records = filteredRecords();
  const metrics = calculateMetrics(records);
  const carriers = groupMetrics(records, "carrier");
  const regions = groupMetrics(records, "region");
  const segmentLines = (label, groups) => [
    `### By ${label}`,
    "| Segment | Orders | Eligible delivered | On time | Cancellation | Average delay |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...groups.map((group) => `| ${group.label} | ${group.orders} | ${group.eligibleDelivered} | ${formatPercent(group.onTimeRate)} | ${formatPercent(group.cancellationRate)} | ${formatHours(group.averageDelayHours)} |`)
  ];
  const content = [
    "# Delivery performance report",
    "",
    `Data source: ${state.origin}${state.origin === "synthetic demo" ? " (synthetic; not a real result)" : ""}`,
    `Orders in view: ${metrics.orders}`,
    "",
    "## Key indicators",
    `- On-time delivery: ${formatPercent(metrics.onTimeRate)} (${metrics.onTime}/${metrics.eligibleDelivered} eligible delivered orders)`,
    `- Average dispatch-to-delivery time: ${formatHours(metrics.averageDeliveryHours)} (${metrics.deliveryDurationCount} timestamped deliveries)`,
    `- Cancellation rate: ${formatPercent(metrics.cancellationRate)} (${metrics.cancelled}/${metrics.orders} placed orders)`,
    `- Customer rating: ${formatRating(metrics.ratingAverage)} (${metrics.ratingCount} rated deliveries)`,
    `- Delivery-date coverage: ${formatPercent(metrics.deliveryDateCoverage)}`,
    "",
    ...segmentLines("carrier", carriers),
    "",
    ...segmentLines("region", regions),
    "",
    "## Interpretation notes",
    "On-time rate uses delivered orders with valid promised and actual dates; delivery time is dispatch-to-actual-delivery. Segment rates with fewer than 10 eligible deliveries are directional only. These descriptive comparisons do not establish causation; investigate operational context before changing decisions.",
    ""
  ].join("\n");
  const link = document.createElement("a");
  const reportUrl = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  link.href = reportUrl;
  link.download = "delivery-performance-report.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(reportUrl), 1000);
}

async function importCsv(file) {
  elements.importMessage.hidden = true;
  try {
    const text = await file.text();
    const result = normalizeRows(parseCsv(text));
    setRecords(result.records, file.name, result.duplicateCount);
    elements.importMessage.hidden = false;
    elements.importMessage.textContent = `Imported ${numberFormat.format(result.records.length)} orders from ${file.name}.`;
    elements.importMessage.classList.remove("is-error");
  } catch (error) {
    elements.importMessage.hidden = false;
    elements.importMessage.textContent = error instanceof Error ? error.message : "Unable to read this CSV.";
    elements.importMessage.classList.add("is-error");
  }
}

$("#csv-file").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importCsv(file);
  event.target.value = "";
});
$("#load-demo").addEventListener("click", () => {
  elements.importMessage.hidden = true;
  elements.period.value = "90";
  setRecords(makeDemoRecords(), "synthetic demo");
});
$("#export-report").addEventListener("click", exportReport);
for (const select of [elements.period, elements.region, elements.carrier]) select.addEventListener("change", render);
$("#clear-filters").addEventListener("click", () => {
  elements.period.value = "all";
  elements.region.value = "all";
  elements.carrier.value = "all";
  render();
});

setRecords(makeDemoRecords(), "synthetic demo");