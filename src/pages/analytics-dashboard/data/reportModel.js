// Frontend data model for the Analytics overview. Every number is real.
//
// One daily row per date:
//   { date, visitors, uniqueVisitors, loggedInUsers, guestUsers, utmVisitors,
//     nonUtmVisitors, contentClicks, engagedVisitors, paymentAttempts,
//     successfulPayments, failedPayments, pendingPayments, cancelledPayments,
//     revenue, renewals, renewalRevenue }
//
//   visitors, uniqueVisitors <- GET /api/analytics/dashboard/trend
//                               (sessions / totalVisitors)
//   audience + engagement    <- GET /api/analytics/dashboard/engagement
//                               (guests = unique visitors - logged-in)
//   payment fields           <- GET /api/analytics/dashboard/payments
//                               (the payments table; first-time checkouts,
//                               with automatic renewals kept separate)

const PAYMENT_FIELDS = [
  'paymentAttempts',
  'successfulPayments',
  'failedPayments',
  'pendingPayments',
  'cancelledPayments',
  'revenue',
  'renewals',
  'renewalRevenue',
];

const ENGAGEMENT_FIELDS = {
  loggedInUsers: 'loggedInUsers',
  utmVisitors: 'utmVisits',
  nonUtmVisitors: 'nonUtmVisits',
  contentClicks: 'contentClicks',
  engagedVisitors: 'engagedVisitors',
};

// trendSeries = `series` from /dashboard/trend; paymentSeries / engagementSeries
// = `series` from /dashboard/payments and /dashboard/engagement (only days
// that had data).
export function buildDailyRows(trendSeries = [], paymentSeries = [], engagementSeries = []) {
  const byDate = new Map();
  const rowFor = (date) => {
    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        visitors: 0,
        uniqueVisitors: 0,
        ...Object.fromEntries(Object.keys(ENGAGEMENT_FIELDS).map((f) => [f, 0])),
        ...Object.fromEntries(PAYMENT_FIELDS.map((f) => [f, 0])),
      });
    }
    return byDate.get(date);
  };

  for (const point of trendSeries) {
    const row = rowFor(point.date);
    row.visitors = point.sessions || 0;
    row.uniqueVisitors = point.totalVisitors || 0;
  }
  for (const point of paymentSeries) {
    const row = rowFor(point.date);
    PAYMENT_FIELDS.forEach((f) => { row[f] = Number(point[f]) || 0; });
  }
  for (const point of engagementSeries) {
    const row = rowFor(point.date);
    Object.entries(ENGAGEMENT_FIELDS).forEach(([field, apiField]) => { row[field] = Number(point[apiField]) || 0; });
  }

  return Array.from(byDate.values())
    .map((row) => ({ ...row, guestUsers: Math.max(0, row.uniqueVisitors - row.loggedInUsers) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

// Period totals + derived rates. `realSummary` (GET /dashboard/summary) and
// `engagementTotals` (GET /dashboard/engagement `totals`) win for people
// counts: summing daily distinct counts would double-count anyone active on
// more than one day.
export function summarize(rows, realSummary, engagementTotals) {
  const sum = (field) => rows.reduce((total, row) => total + (row[field] || 0), 0);
  const totals = {
    visitors: realSummary ? realSummary.sessions : sum('visitors'),
    uniqueVisitors: realSummary ? realSummary.uniqueVisitors : sum('uniqueVisitors'),
    loggedInUsers: engagementTotals ? engagementTotals.loggedInUsers : sum('loggedInUsers'),
    utmVisitors: sum('utmVisitors'),
    nonUtmVisitors: sum('nonUtmVisitors'),
    contentClicks: sum('contentClicks'),
    engagedVisitors: engagementTotals ? engagementTotals.engagedVisitors : sum('engagedVisitors'),
    paymentAttempts: sum('paymentAttempts'),
    successfulPayments: sum('successfulPayments'),
    failedPayments: sum('failedPayments'),
    pendingPayments: sum('pendingPayments'),
    cancelledPayments: sum('cancelledPayments'),
    revenue: sum('revenue'),
    renewals: sum('renewals'),
    renewalRevenue: sum('renewalRevenue'),
  };

  totals.guestUsers = Math.max(0, totals.uniqueVisitors - totals.loggedInUsers);
  totals.notCompleted = totals.paymentAttempts - totals.successfulPayments;

  totals.rates = {
    visitorToLogin: pct(totals.loggedInUsers, totals.uniqueVisitors),
    loginToAttempt: pct(totals.paymentAttempts, totals.loggedInUsers),
    engagement: pct(totals.engagedVisitors, totals.uniqueVisitors),
    visitorToAttempt: pct(totals.paymentAttempts, totals.uniqueVisitors),
    attemptToSuccess: pct(totals.successfulPayments, totals.paymentAttempts),
    visitorToPaid: pct(totals.successfulPayments, totals.uniqueVisitors),
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
