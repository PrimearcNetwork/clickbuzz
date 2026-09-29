// Fetch wrapper for the analytics dashboard (see CLAUDE.md §23) — mirrors
// the shape of src/services/api.js (this project's existing pattern) but
// kept in its own export so the analytics module never imports from the
// admin/consumer API surface.
const BASE = `${import.meta.env.VITE_API_URL}/api/analytics`;

const buildQuery = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, value);
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
};

const get = (path) =>
  fetch(`${BASE}${path}`).then((r) => {
    if (!r.ok) throw new Error(`API error ${r.status}`);
    return r.json();
  });

export const analyticsApi = {
  getSummary: (params) => get(`/dashboard/summary${buildQuery(params)}`),
  getActive: () => get('/dashboard/active'),
  getTrend: (params) => get(`/dashboard/trend${buildQuery(params)}`),
  getBreakdown: (dimension, params) => get(`/dashboard/breakdown${buildQuery({ dimension, ...params })}`),
  getUtmCampaigns: (params) => get(`/dashboard/utm-campaigns${buildQuery(params)}`),
  getPayments: (params) => get(`/dashboard/payments${buildQuery(params)}`),
  getEngagement: (params) => get(`/dashboard/engagement${buildQuery(params)}`),
  getSessions: (params) => get(`/visitors${buildQuery(params)}`),
  getFilterOptions: (params) => get(`/visitors/filters${buildQuery(params)}`),
  getVisitorDetail: (visitorId) => get(`/visitors/${encodeURIComponent(visitorId)}/detail`),
  exportCsvUrl: (params) => `${BASE}/export/csv${buildQuery(params)}`,
};
