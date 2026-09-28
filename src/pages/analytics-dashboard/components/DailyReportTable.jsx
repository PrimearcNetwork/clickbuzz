import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { isSampleField, rowConversionRate, formatNumber, formatPercent, formatCurrency } from '../data/reportModel';

// Date-by-date report: visits, engagement and payments per day, grouped
// headers, sortable columns, a totals row, paging. Columns backed by
// sample data carry a dashed underline + "Sample" marker in the header.
const COLUMN_GROUPS = [
  {
    label: 'Visits',
    columns: [
      { key: 'visitors', label: 'Total visits' },
      { key: 'uniqueVisitors', label: 'Unique' },
      { key: 'utmVisitors', label: 'With UTM' },
      { key: 'nonUtmVisitors', label: 'Without UTM' },
    ],
  },
  {
    label: 'Engagement',
    columns: [
      { key: 'contentClicks', label: 'Content clicks' },
      { key: 'loggedInUsers', label: 'Logged-in' },
      { key: 'guestUsers', label: 'Guests' },
    ],
  },
  {
    label: 'Payments',
    columns: [
      { key: 'paymentAttempts', label: 'Attempts' },
      { key: 'successfulPayments', label: 'Successful' },
      { key: 'failedPayments', label: 'Failed' },
      { key: 'pendingPayments', label: 'Pending' },
      { key: 'conversionRate', label: 'Conversion', format: formatPercent, sampleFrom: 'successfulPayments' },
      { key: 'revenue', label: 'Revenue', format: formatCurrency },
    ],
  },
];

const ALL_COLUMNS = COLUMN_GROUPS.flatMap((g) => g.columns);
const PAGE_SIZES = [10, 25, 50];

const formatDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

const SortIcon = ({ sort, colKey }) => {
  if (sort.key !== colKey) return <ChevronsUpDown size={12} className="opacity-40" aria-hidden="true" />;
  return sort.dir === 'asc' ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />;
};

const DailyReportTable = ({ rows, totals }) => {
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  const enriched = useMemo(() => rows.map((row) => ({ ...row, conversionRate: rowConversionRate(row) })), [rows]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...enriched].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [enriched, sort]);

  if (!rows.length) {
    return <div className="py-8 text-center text-sm text-[#898781]">No data for this date range</div>;
  }

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
    setPage(0);
  };

  const cell = (col, value) => (col.format ? col.format(value) : formatNumber(value));
  const totalsRow = { ...totals, conversionRate: totals.rates?.visitorToPaid || 0 };

  return (
    <div>
      <div className="overflow-x-auto -mx-4 md:-mx-5 px-4 md:px-5">
        <table className="w-full min-w-[1100px] text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-[#898781]">
              <th rowSpan={2} className="sticky left-0 z-10 bg-[#12161f] text-left font-medium py-2 pr-4 border-b border-white/10 align-bottom">
                <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 hover:text-white">
                  Date <SortIcon sort={sort} colKey="date" />
                </button>
              </th>
              {COLUMN_GROUPS.map((group) => (
                <th key={group.label} colSpan={group.columns.length} className="text-left font-semibold text-[#c3c2b7] py-2 px-3 border-b border-white/10 border-l border-l-white/10">
                  {group.label}
                </th>
              ))}
            </tr>
            <tr className="text-[11px] uppercase tracking-wider text-[#898781]">
              {ALL_COLUMNS.map((col, i) => {
                const sample = isSampleField(col.sampleFrom || col.key);
                const groupStart = COLUMN_GROUPS.some((g) => g.columns[0].key === col.key);
                return (
                  <th
                    key={col.key}
                    aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`text-right font-medium py-2 px-3 border-b border-white/10 whitespace-nowrap ${groupStart && i > 0 ? 'border-l border-l-white/10' : ''} ${groupStart && i === 0 ? 'border-l border-l-white/10' : ''}`}
                  >
                    <button type="button" onClick={() => toggleSort(col.key)} className="inline-flex items-center gap-1 hover:text-white">
                      <span className={sample ? 'underline decoration-dashed decoration-white/30 underline-offset-4' : ''} title={sample ? 'Sample data — not tracked yet' : undefined}>
                        {col.label}
                      </span>
                      <SortIcon sort={sort} colKey={col.key} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.date} className="hover:bg-white/[0.03]">
                <td className="sticky left-0 z-10 bg-[#12161f] py-2.5 pr-4 text-white font-medium whitespace-nowrap border-b border-white/5">{formatDate(row.date)}</td>
                {ALL_COLUMNS.map((col) => {
                  const groupStart = COLUMN_GROUPS.some((g) => g.columns[0].key === col.key);
                  return (
                    <td key={col.key} className={`py-2.5 px-3 text-right tabular-nums text-[#c3c2b7] border-b border-white/5 ${groupStart ? 'border-l border-l-white/10' : ''}`}>
                      {cell(col, row[col.key])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky left-0 z-10 bg-[#12161f] py-2.5 pr-4 text-xs uppercase tracking-wider text-[#898781] font-semibold">Period total</td>
              {ALL_COLUMNS.map((col) => {
                const groupStart = COLUMN_GROUPS.some((g) => g.columns[0].key === col.key);
                return (
                  <td key={col.key} className={`py-2.5 px-3 text-right tabular-nums text-white font-semibold ${groupStart ? 'border-l border-l-white/10' : ''}`}>
                    {cell(col, totalsRow[col.key])}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#898781]">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            Rows
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[#c3c2b7]"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="hidden sm:inline">
            <span className="underline decoration-dashed decoration-white/30 underline-offset-4">Dashed</span> columns show sample data. Unique visitors in the total are de-duplicated across days.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="px-2.5 py-1 rounded-lg border border-white/10 disabled:opacity-40 hover:text-white">Prev</button>
          <span className="tabular-nums">Page {safePage + 1} of {pageCount}</span>
          <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="px-2.5 py-1 rounded-lg border border-white/10 disabled:opacity-40 hover:text-white">Next</button>
        </div>
      </div>
    </div>
  );
};

export default DailyReportTable;
