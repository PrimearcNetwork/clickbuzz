// Frontend data model for the Analytics overview.
//
// One daily row per date:
//   { date, visitors, uniqueVisitors, loggedInUsers, guestUsers, utmVisitors,
//     nonUtmVisitors, contentClicks, engagedVisitors, paymentAttempts,
//     successfulPayments, failedPayments, pendingPayments, cancelledPayments,
//     revenue }
//
// REAL fields come from the existing /api/analytics/dashboard/trend response:
//   visitors        <- sessions (total visits)
//   uniqueVisitors  <- totalVisitors (distinct visitors that day)
//
// Every other field is SAMPLE data: those metrics aren't tracked yet, so
// they're generated here (deterministically, derived from the real visit
// counts so the funnel stays coherent) purely so the design can be reviewed.
// To connect real data later, replace `sampleMetricsFor()` (or the whole
// `buildDailyRows()`) with values from an API response and drop the field
// from SAMPLE_FIELDS — nothing in the UI needs to change.

export const SAMPLE_FIELDS = new Set([
  'loggedInUsers',
  'guestUsers',
  'utmVisitors',
  'nonUtmVisitors',
  'contentClicks',
  'engagedVisitors',
  'paymentAttempts',
  'successfulPayments',
  'failedPayments',
  'pendingPayments',
  'cancelledPayments',
  'revenue',
]);

export const isSampleField = (field) => SAMPLE_FIELDS.has(field);

// Price used only for SAMPLE revenue (the Monthly plan).
const SAMPLE_PLAN_PRICE = 199;

// Deterministic 0..1 value from a string, so sample numbers don't jump on
// every re-render or refresh.
function seeded(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const between = (key, min, max) => min + seeded(key) * (max - min);

// SAMPLE: replace with real per-day values once tracked.
function sampleMetricsFor(date, visitors, uniqueVisitors) {
  const loggedInUsers = Math.round(uniqueVisitors * between(`${date}:li`, 0.25, 0.45));
  const utmVisitors = Math.round(visitors * between(`${date}:utm`, 0.4, 0.7));
  const engagedVisitors = Math.round(uniqueVisitors * between(`${date}:eng`, 0.35, 0.6));
  const contentClicks = Math.round(engagedVisitors * between(`${date}:clk`, 1.8, 3.6));
  const paymentAttempts = Math.round(engagedVisitors * between(`${date}:att`, 0.12, 0.28));
  const successfulPayments = Math.round(paymentAttempts * between(`${date}:ok`, 0.5, 0.75));
  const notCompleted = paymentAttempts - successfulPayments;
  const failedPayments = Math.round(notCompleted * between(`${date}:fail`, 0.45, 0.7));
  const pendingPayments = Math.round((notCompleted - failedPayments) * between(`${date}:pend`, 0.4, 0.7));
  const cancelledPayments = notCompleted - failedPayments - pendingPayments;

  return {
    loggedInUsers,
    guestUsers: Math.max(0, uniqueVisitors - loggedInUsers),
    utmVisitors,
    nonUtmVisitors: Math.max(0, visitors - utmVisitors),
    contentClicks,
    engagedVisitors,
    paymentAttempts,
    successfulPayments,
    failedPayments,
    pendingPayments,
    cancelledPayments,
    revenue: successfulPayments * SAMPLE_PLAN_PRICE,
  };
}

// trendSeries = the `series` array from GET /api/analytics/dashboard/trend.
export function buildDailyRows(trendSeries = []) {
  return trendSeries.map((point) => {
    const visitors = point.sessions || 0;
    const uniqueVisitors = point.totalVisitors || 0;
    return {
      date: point.date,
      visitors,
      uniqueVisitors,
      ...sampleMetricsFor(point.date, visitors, uniqueVisitors),
    };
  });
}

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

// Period totals + derived rates. `realSummary` (GET /dashboard/summary) wins
// for visitor counts: summing daily unique visitors would double-count
// people who visited on more than one day.
export function summarize(rows, realSummary) {
  const sum = (field) => rows.reduce((total, row) => total + (row[field] || 0), 0);
  const totals = {
    visitors: realSummary ? realSummary.sessions : sum('visitors'),
    uniqueVisitors: realSummary ? realSummary.uniqueVisitors : sum('uniqueVisitors'),
    loggedInUsers: sum('loggedInUsers'),
    guestUsers: sum('guestUsers'),
    utmVisitors: sum('utmVisitors'),
    nonUtmVisitors: sum('nonUtmVisitors'),
    contentClicks: sum('contentClicks'),
    engagedVisitors: sum('engagedVisitors'),
    paymentAttempts: sum('paymentAttempts'),
    successfulPayments: sum('successfulPayments'),
    failedPayments: sum('failedPayments'),
    pendingPayments: sum('pendingPayments'),
    cancelledPayments: sum('cancelledPayments'),
    revenue: sum('revenue'),
  };

  totals.notCompleted = totals.paymentAttempts - totals.successfulPayments;

  totals.rates = {
    visitorToAttempt: pct(totals.paymentAttempts, totals.uniqueVisitors),
    attemptToSuccess: pct(totals.successfulPayments, totals.paymentAttempts),
    visitorToPaid: pct(totals.successfulPayments, totals.uniqueVisitors),
    engagement: pct(totals.engagedVisitors, totals.uniqueVisitors),
    failure: pct(totals.failedPayments, totals.paymentAttempts),
    pending: pct(totals.pendingPayments, totals.paymentAttempts),
    cancelled: pct(totals.cancelledPayments, totals.paymentAttempts),
  };
  totals.avgTransactionValue = totals.successfulPayments > 0 ? totals.revenue / totals.successfulPayments : 0;
  return totals;
}

// % change vs the previous period; null when there's nothing to compare to.
export function percentChange(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Daily conversion rate for the report table.
export const rowConversionRate = (row) => pct(row.successfulPayments, row.uniqueVisitors);

// SAMPLE extras for a UTM campaign row (the real row has sessions + conversions).
export function sampleUtmMetrics(row) {
  const key = `${row.source}|${row.medium}|${row.campaign}`;
  const contentClicks = Math.round(row.sessions * between(`${key}:clk`, 0.8, 2.2));
  const paymentAttempts = Math.round(row.sessions * between(`${key}:att`, 0.05, 0.18));
  const successfulPayments = Math.round(paymentAttempts * between(`${key}:ok`, 0.5, 0.75));
  return { contentClicks, paymentAttempts, successfulPayments, conversionRate: pct(successfulPayments, row.sessions) };
}

// ---- date helpers -------------------------------------------------------

export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// The equally long period immediately before `range` (for "vs previous").
export function previousRange(range) {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const days = Math.round((to - from) / 86400000) + 1;
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
  return { from: toISODate(prevFrom), to: toISODate(prevTo) };
}

export const formatNumber = (n) => Math.round(n || 0).toLocaleString('en-IN');
export const formatPercent = (n, digits = 1) => `${(n || 0).toFixed(digits)}%`;
export const formatCurrency = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
export const formatDayLabel = (dateStr) =>
  new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
