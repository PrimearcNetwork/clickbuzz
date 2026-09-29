import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download } from 'lucide-react';
import { analyticsApi } from '../../services/analyticsApi';
import Panel from './components/Panel';
import DateRangeFilter from './components/DateRangeFilter';

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Opens on "Today" (same dates as the Today preset in DateRangeFilter).
function defaultRange() {
  const today = toISODate(new Date());
  return { from: today, to: today };
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SELECT_FILTERS = [
  { key: 'country', label: 'Country', optionsKey: 'countries' },
  { key: 'state', label: 'State', optionsKey: 'states' },
  { key: 'city', label: 'City', optionsKey: 'cities' },
  { key: 'source', label: 'Source', optionsKey: 'sources' },
  { key: 'campaign', label: 'Campaign', optionsKey: 'campaigns' },
  { key: 'device', label: 'Device', optionsKey: 'devices' },
  { key: 'browser', label: 'Browser', optionsKey: 'browsers' },
  { key: 'os', label: 'OS', optionsKey: 'operatingSystems' },
];

const SEGMENTS = [
  { key: 'all', label: 'All Visitors' },
  { key: 'returning', label: 'Returning' },
  { key: 'newVisitors', label: 'New' },
  { key: 'converted', label: 'Converted' },
];

const AnalyticsVisitors = () => {
  const [range, setRange] = useState(defaultRange);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ country: '', state: '', city: '', source: '', campaign: '', device: '', browser: '', os: '' });
  const [segment, setSegment] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [filterOptions, setFilterOptions] = useState({});
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [range.from, range.to, search, filters, segment]);

  useEffect(() => {
    analyticsApi.getFilterOptions(range).then(setFilterOptions).catch(() => { /* dropdowns just stay empty */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const queryParams = useMemo(() => ({
    ...range,
    page,
    limit,
    search: search || undefined,
    ...filters,
    returning: segment === 'returning' ? '1' : undefined,
    newVisitors: segment === 'newVisitors' ? '1' : undefined,
    converted: segment === 'converted' ? '1' : undefined,
  }), [range, page, limit, search, filters, segment]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyticsApi.getSessions(queryParams)
      .then((res) => { if (!cancelled) setResult(res); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load visitors'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [queryParams]);

  const exportUrl = (all) => analyticsApi.exportCsvUrl({
    ...queryParams,
    page: undefined,
    limit: undefined,
    all: all ? '1' : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />

        <div className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-[#3987e5]/15 text-[#6fa8f0] hover:bg-[#3987e5]/25 transition-colors"
          >
            <Download size={14} /> Export CSV
          </button>
          {exportOpen ? (
            <div className="absolute right-0 mt-2 w-64 bg-[#12161f] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
              <a
                href={exportUrl(false)}
                onClick={() => setExportOpen(false)}
                className="block px-4 py-3 text-xs text-[#c3c2b7] hover:bg-white/5 hover:text-white border-b border-white/5"
              >
                Current filtered data
                <div className="text-[10px] text-[#898781] mt-0.5">Respects date range + active filters/search</div>
              </a>
              <a
                href={exportUrl(true)}
                onClick={() => setExportOpen(false)}
                className="block px-4 py-3 text-xs text-[#c3c2b7] hover:bg-white/5 hover:text-white"
              >
                Entire dataset
                <div className="text-[10px] text-[#898781] mt-0.5">Ignores date range, keeps other filters</div>
              </a>
            </div>
          ) : null}
        </div>
      </div>

      <Panel title="Filters">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#898781]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search visitor ID, session ID, landing page, referrer, campaign…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-[#898781]"
            />
          </div>

          {SELECT_FILTERS.map((f) => (
            <select
              key={f.key}
              value={filters[f.key]}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-[#c3c2b7]"
            >
              <option value="">{f.label}</option>
              {(filterOptions[f.optionsKey] || []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ))}

          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-[#c3c2b7]"
          >
            {SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </Panel>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl p-4">{error}</div>
      ) : null}

      <Panel
        title={`${result.total.toLocaleString()} Sessions`}
        action={(
          <div className="flex items-center gap-2 text-xs text-[#898781]">
            <span>Rows</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[#c3c2b7]"
            >
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        className="!p-0 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-[#898781] uppercase tracking-wide border-b border-white/10">
                {['Date', 'Visitor ID', 'Session ID', 'Source', 'Medium', 'Campaign', 'Country', 'State', 'City', 'Device', 'Browser', 'OS', 'Landing Page', 'Exit Page', 'Duration', 'Pages', 'Conversion', 'Last Activity'].map((h) => (
                  <th key={h} className="py-3 px-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={18} className="py-10 text-center text-[#898781]">Loading…</td></tr>
              ) : result.data.length === 0 ? (
                <tr><td colSpan={18} className="py-10 text-center text-[#898781]">No sessions match these filters</td></tr>
              ) : result.data.map((row) => (
                <tr key={row.sessionId} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{new Date(row.date).toLocaleString()}</td>
                  <td className="py-2.5 px-3">
                    <Link to={`/analytics/visitors/${encodeURIComponent(row.visitorId)}`} className="text-[#6fa8f0] hover:underline font-mono">
                      {row.visitorId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#898781]">{row.sessionId.slice(0, 8)}…</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{row.source || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{row.medium || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{row.campaign || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{row.country || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{row.state || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{row.city || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7] capitalize">{row.device || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{row.browser || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{row.os || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7] max-w-[160px] truncate" title={row.landingPage}>{row.landingPage || '—'}</td>
                  <td className="py-2.5 px-3 text-[#c3c2b7] max-w-[160px] truncate" title={row.exitPage}>{row.exitPage || '—'}</td>
                  <td className="py-2.5 px-3 text-white tabular-nums">{formatDuration(row.sessionDuration)}</td>
                  <td className="py-2.5 px-3 text-white tabular-nums">{row.pagesViewed}</td>
                  <td className="py-2.5 px-3">
                    {row.conversion ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#0ca30c]/15 text-[#0ca30c] text-[10px] font-medium">Yes</span>
                    ) : (
                      <span className="text-[#898781]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-[#c3c2b7]">{new Date(row.lastActivity).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 text-xs text-[#898781]">
          <span>Page {result.page || page} of {result.totalPages || 1}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= (result.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
};

export default AnalyticsVisitors;
