import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, UserCheck, LogIn, UserRound, MousePointerClick, CreditCard,
  CheckCircle2, XCircle, Clock, RefreshCw,
} from 'lucide-react';
import { analyticsApi } from '../../services/analyticsApi';
import StatCard from './components/StatCard';
import Panel from './components/Panel';
import TrendChart from './components/TrendChart';
import MultiSeriesTrendChart from './components/MultiSeriesTrendChart';
import ConversionFunnel from './components/ConversionFunnel';
import PaymentStatusBar from './components/PaymentStatusBar';
import DailyReportTable from './components/DailyReportTable';
import VisitorTimeline from './components/VisitorTimeline';
import RankedBarList from './components/RankedBarList';
import UtmCampaignTable from './components/UtmCampaignTable';
import DateRangeFilter from './components/DateRangeFilter';
import FilterBar from './components/FilterBar';
import SummaryInsights from './components/SummaryInsights';
import { VISITOR_SERIES_COLORS } from './vizTheme';
import {
  buildDailyRows, summarize, percentChange, previousRange, toISODate,
  formatNumber, formatPercent, formatCurrency, formatDayLabel,
} from './data/reportModel';

// Existing single-metric engagement trend (all real data).
const METRICS = [
  { key: 'totalVisitors', label: 'Visitors' },
  { key: 'newVisitors', label: 'New Visitors' },
  { key: 'returningVisitors', label: 'Returning Visitors' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'pageViews', label: 'Page Views' },
  { key: 'avgSessionDuration', label: 'Avg. Session Duration (s)' },
  { key: 'bounceRate', label: 'Bounce Rate (%)' },
  { key: 'conversions', label: 'Conversions' },
];

const GRANULARITIES = ['day', 'week', 'month'];

// Same generic breakdown endpoint every panel here reads from (see
// backend/controllers/analytics/dashboard.controller.js's DIMENSIONS map).
const BREAKDOWN_PANELS = [
  { dimension: 'trafficSource', title: 'Traffic Sources' },
  { dimension: 'device', title: 'Device Breakdown' },
  { dimension: 'browser', title: 'Browser Breakdown' },
  { dimension: 'os', title: 'Operating Systems' },
  { dimension: 'country', title: 'Countries' },
  { dimension: 'region', title: 'States' },
  { dimension: 'city', title: 'Cities' },
  { dimension: 'landingPage', title: 'Top Landing Pages' },
  { dimension: 'exitPage', title: 'Top Exit Pages' },
  { dimension: 'referrer', title: 'Top Referrers' },
];

// Shown in the Marketing section instead of the audience grid.
const MARKETING_PANELS = [
  { dimension: 'trafficSource', title: 'Traffic Sources', subtitle: 'Visits by source.' },
  { dimension: 'referrer', title: 'Top Referrers', subtitle: 'Visits by referring site.' },
];
const MARKETING_DIMENSIONS = new Set(MARKETING_PANELS.map((p) => p.dimension));

// Visitor trend series — fixed color order (validated palette), never cycled.
const VISITOR_SERIES = [
  { key: 'visitors', label: 'Visits' },
  { key: 'uniqueVisitors', label: 'Unique visitors' },
  { key: 'loggedInUsers', label: 'Logged-in' },
  { key: 'guestUsers', label: 'Guests' },
].map((s, i) => ({ ...s, color: VISITOR_SERIES_COLORS[i] }));

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

function isoWeekStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

const bucketKey = (date, granularity) => (granularity === 'week' ? isoWeekStart(date) : date.slice(0, 7));
const bucketLabel = (key, granularity) => (granularity === 'week' ? `Wk ${formatDayLabel(key)}` : key);

// Buckets the raw daily series (always what the API returns) into
// week/month points for display — the backend maintains one daily rollup
// table, not three separate aggregations (see rollup.service.js).
function bucketTrend(series, granularity, metricKey) {
  if (granularity === 'day') {
    return series.map((point) => ({ label: formatDayLabel(point.date), value: point[metricKey] || 0 }));
  }

  const isAverageMetric = metricKey === 'bounceRate' || metricKey === 'avgSessionDuration';
  const buckets = new Map();
  for (const point of series) {
    const key = bucketKey(point.date, granularity);
    if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0 });
    const bucket = buckets.get(key);
    bucket.sum += point[metricKey] || 0;
    bucket.count += 1;
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => ({
    label: bucketLabel(key, granularity),
    value: isAverageMetric ? Math.round(bucket.sum / bucket.count) : bucket.sum
  }));
}

// Same bucketing for the multi-series visitor chart (all fields are sums).
function bucketRows(rows, granularity, keys) {
  if (granularity === 'day') {
    return rows.map((row) => ({ label: formatDayLabel(row.date), ...Object.fromEntries(keys.map((k) => [k, row[k]])) }));
  }
  const buckets = new Map();
  for (const row of rows) {
    const key = bucketKey(row.date, granularity);
    if (!buckets.has(key)) buckets.set(key, Object.fromEntries(keys.map((k) => [k, 0])));
    const bucket = buckets.get(key);
    keys.forEach((k) => { bucket[k] += row[k] || 0; });
  }
  return Array.from(buckets.entries()).map(([key, values]) => ({ label: bucketLabel(key, granularity), ...values }));
}

const GranularityToggle = ({ value, onChange }) => (
  <div className="flex rounded-lg overflow-hidden border border-white/10">
    {GRANULARITIES.map((g) => (
      <button
        key={g}
        type="button"
        aria-pressed={value === g}
        onClick={() => onChange(g)}
        className={`px-2.5 py-1 text-xs capitalize transition-colors ${value === g ? 'bg-[#3987e5]/20 text-[#6fa8f0]' : 'text-[#898781] hover:text-white'}`}
      >
        {g}
      </button>
    ))}
  </div>
);

const SectionHeading = ({ title, description }) => (
  <div className="pt-4">
    <h2 className="text-base md:text-lg font-semibold text-white">{title}</h2>
    {description ? <p className="mt-0.5 text-sm text-[#898781]">{description}</p> : null}
  </div>
);

const MiniStat = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-xs text-[#898781]">{label}</div>
    <div className="mt-1 text-lg font-semibold text-white tabular-nums">{value}</div>
  </div>
);

const AnalyticsOverview = () => {
  const [range, setRange] = useState(defaultRange);
  const [refreshKey, setRefreshKey] = useState(0);
  const [summary, setSummary] = useState(null);
  const [prevSummary, setPrevSummary] = useState(null);
  const [activeVisitors, setActiveVisitors] = useState(null);
  const [trendSeries, setTrendSeries] = useState([]);
  const [prevTrendSeries, setPrevTrendSeries] = useState([]);
  const [paymentSeries, setPaymentSeries] = useState([]);
  const [prevPaymentSeries, setPrevPaymentSeries] = useState([]);
  const [paymentPeople, setPaymentPeople] = useState(null);
  const [engagement, setEngagement] = useState({ series: [], totals: null });
  const [prevEngagement, setPrevEngagement] = useState({ series: [], totals: null });
  const [trendMetric, setTrendMetric] = useState('totalVisitors');
  const [granularity, setGranularity] = useState('day');
  const [visitorGranularity, setVisitorGranularity] = useState('day');
  const [breakdowns, setBreakdowns] = useState({});
  const [utmCampaigns, setUtmCampaigns] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const prev = previousRange(range);

    Promise.all([
      analyticsApi.getSummary(range),
      analyticsApi.getTrend(range),
      analyticsApi.getUtmCampaigns(range),
      analyticsApi.getPayments(range),
      analyticsApi.getEngagement(range),
      ...BREAKDOWN_PANELS.map((panel) => analyticsApi.getBreakdown(panel.dimension, { ...range, limit: 8 }))
    ])
      .then(([summaryRes, trendRes, utmRes, paymentsRes, engagementRes, ...breakdownResList]) => {
        if (cancelled) return;
        setSummary(summaryRes);
        setTrendSeries(trendRes.series || []);
        setUtmCampaigns(utmRes.data || []);
        setPaymentSeries(paymentsRes.series || []);
        setPaymentPeople(paymentsRes.totals || null);
        setEngagement({ series: engagementRes.series || [], totals: engagementRes.totals || null });
        const nextBreakdowns = {};
        BREAKDOWN_PANELS.forEach((panel, i) => {
          nextBreakdowns[panel.dimension] = breakdownResList[i].data || [];
        });
        setBreakdowns(nextBreakdowns);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load analytics data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Previous period (same endpoints) for the "vs previous period" deltas,
    // and the latest visits for the timeline. Non-critical: failures only
    // hide the deltas / timeline, never the page.
    Promise.all([
      analyticsApi.getSummary(prev),
      analyticsApi.getTrend(prev),
      analyticsApi.getPayments(prev),
      analyticsApi.getEngagement(prev),
    ])
      .then(([prevSummaryRes, prevTrendRes, prevPaymentsRes, prevEngagementRes]) => {
        if (cancelled) return;
        setPrevSummary(prevSummaryRes);
        setPrevTrendSeries(prevTrendRes.series || []);
        setPrevPaymentSeries(prevPaymentsRes.series || []);
        setPrevEngagement({ series: prevEngagementRes.series || [], totals: prevEngagementRes.totals || null });
      })
      .catch(() => {
        if (cancelled) return;
        setPrevSummary(null);
        setPrevTrendSeries([]);
        setPrevPaymentSeries([]);
        setPrevEngagement({ series: [], totals: null });
      });

    analyticsApi.getSessions({ ...range, page: 1, limit: 8 })
      .then((res) => { if (!cancelled) setRecentSessions(res.data || []); })
      .catch(() => { if (!cancelled) setRecentSessions([]); });

    return () => { cancelled = true; };
  }, [range, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      analyticsApi.getActive().then((res) => {
        if (!cancelled) setActiveVisitors(Number.isFinite(res?.activeVisitors) ? res.activeVisitors : null);
      }).catch(() => { /* non-critical — leave last known value */ });
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const dailyRows = useMemo(
    () => buildDailyRows(trendSeries, paymentSeries, engagement.series),
    [trendSeries, paymentSeries, engagement.series]
  );
  const totals = useMemo(() => summarize(dailyRows, summary, engagement.totals), [dailyRows, summary, engagement.totals]);
  const prevTotals = useMemo(
    () => (prevSummary
      ? summarize(buildDailyRows(prevTrendSeries, prevPaymentSeries, prevEngagement.series), prevSummary, prevEngagement.totals)
      : null),
    [prevTrendSeries, prevPaymentSeries, prevEngagement, prevSummary]
  );
  const change = (key) => (prevTotals ? percentChange(totals[key], prevTotals[key]) : null);

  const engagementChartData = useMemo(
    () => bucketTrend(trendSeries, granularity, trendMetric),
    [trendSeries, granularity, trendMetric]
  );
  const visitorChartData = useMemo(
    () => bucketRows(dailyRows, visitorGranularity, VISITOR_SERIES.map((s) => s.key)),
    [dailyRows, visitorGranularity]
  );

  // People at each step of the real flow: visit -> log in with phone ->
  // open checkout -> pay. Payment steps count distinct phone numbers.
  const funnelStages = [
    { key: 'visitors', label: 'Website visitors', value: totals.uniqueVisitors },
    { key: 'loggedIn', label: 'Logged in', value: totals.loggedInUsers },
    { key: 'attempted', label: 'Tried to pay', value: paymentPeople?.attemptedPeople || 0 },
    { key: 'paid', label: 'Paid successfully', value: paymentPeople?.paidPeople || 0 },
  ];

  const ready = Boolean(summary);
  const show = (value) => (ready ? value : '—');

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-white">Analytics</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-[#c3c2b7]" title="Visitors active in the last 5 minutes">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0ca30c]" aria-hidden="true" />
              <span className="tabular-nums text-white font-medium">{activeVisitors != null ? activeVisitors.toLocaleString('en-IN') : '—'}</span> active now
            </span>
          </div>
          <p className="mt-1 text-sm text-[#898781]">Track visitors, engagement and payment conversion across ClickBuz.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-[#c3c2b7] hover:text-white hover:bg-white/5 transition-colors"
          >
            Filters
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-[#c3c2b7] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {showFilters ? <FilterBar /> : null}

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl p-4">{error}</div>
      ) : null}

      {/* 1. Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <StatCard icon={Users} label="Total Visits" value={show(formatNumber(totals.visitors))} delta={change('visitors')} />
        <StatCard icon={UserCheck} label="Unique Visitors" value={show(formatNumber(totals.uniqueVisitors))} delta={change('uniqueVisitors')} />
        <StatCard icon={LogIn} label="Logged-in Users" value={show(formatNumber(totals.loggedInUsers))} hint={ready ? `${formatPercent(totals.rates.visitorToLogin)} of visitors` : null} delta={change('loggedInUsers')} />
        <StatCard icon={UserRound} label="Guest Visitors" value={show(formatNumber(totals.guestUsers))} delta={change('guestUsers')} />
        <StatCard icon={MousePointerClick} label="Content Clicks" value={show(formatNumber(totals.contentClicks))} hint={ready ? `by ${formatNumber(totals.engagedVisitors)} visitors` : null} delta={change('contentClicks')} />
        <StatCard icon={CreditCard} label="Payment Attempts" value={show(formatNumber(totals.paymentAttempts))} hint={ready ? `${formatPercent(totals.rates.visitorToAttempt)} of visitors` : null} delta={change('paymentAttempts')} />
        <StatCard icon={CheckCircle2} label="Successful Payments" value={show(formatNumber(totals.successfulPayments))} hint={ready ? `${formatPercent(totals.rates.attemptToSuccess)} success rate` : null} delta={change('successfulPayments')} />
        <StatCard icon={XCircle} label="Failed Payments" value={show(formatNumber(totals.failedPayments))} hint={ready ? `${formatPercent(totals.rates.failure)} of attempts` : null} delta={change('failedPayments')} goodWhen="down" />
        <StatCard icon={Clock} label="Pending Payments" value={show(formatNumber(totals.pendingPayments))} hint={ready ? `${formatPercent(totals.rates.pending)} of attempts` : null} delta={change('pendingPayments')} goodWhen="down" />
      </div>

      {/* 3. Funnel + 10. Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          title="Visitor to payment funnel"
          subtitle="How many visitors move from visiting to paying, and where they drop off."
          className="xl:col-span-2"
        >
          <ConversionFunnel stages={funnelStages} />
          <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MiniStat label="Didn’t complete" value={formatNumber(totals.notCompleted)} />
            <MiniStat label="Failed" value={formatNumber(totals.failedPayments)} />
            <MiniStat label="Pending" value={formatNumber(totals.pendingPayments)} />
            <MiniStat label="Cancelled" value={formatNumber(totals.cancelledPayments)} />
          </div>
        </Panel>
        <Panel title="Performance summary" subtitle="Figures for the selected period.">
          {ready ? <SummaryInsights totals={totals} visitorsChange={change('visitors')} /> : <div className="py-8 text-center text-sm text-[#898781]">Loading…</div>}
        </Panel>
      </div>

      {/* 2. Visitor analytics */}
      <SectionHeading title="Visitor analytics" description="Who visited, when, and how they arrived." />
      <Panel
        title="Visitors over time"
        action={<GranularityToggle value={visitorGranularity} onChange={setVisitorGranularity} />}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
          <MiniStat label="Total visits" value={show(formatNumber(totals.visitors))} />
          <MiniStat label="Unique visitors" value={show(formatNumber(totals.uniqueVisitors))} />
          <MiniStat label="Logged-in" value={show(formatNumber(totals.loggedInUsers))} />
          <MiniStat label="Guests" value={show(formatNumber(totals.guestUsers))} />
          <MiniStat label="Visits with UTM" value={show(formatNumber(totals.utmVisitors))} />
          <MiniStat label="Visits without UTM" value={show(formatNumber(totals.nonUtmVisitors))} />
        </div>
        {loading && dailyRows.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-[#898781]">Loading…</div>
        ) : (
          <MultiSeriesTrendChart
            data={visitorChartData}
            series={VISITOR_SERIES}
            totals={{ visitors: totals.visitors, uniqueVisitors: totals.uniqueVisitors, loggedInUsers: totals.loggedInUsers, guestUsers: totals.guestUsers }}
          />
        )}
      </Panel>

      {/* 4 + 8. Payment analytics */}
      <SectionHeading title="Payment analytics" description="Attempts, outcomes and conversion rates." />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          title="Payment outcomes"
          subtitle="First-time checkouts. Pending includes checkouts closed without paying."
          className="xl:col-span-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
            <MiniStat label="Payment attempts" value={formatNumber(totals.paymentAttempts)} />
            <MiniStat label="Success rate" value={formatPercent(totals.rates.attemptToSuccess)} />
            <MiniStat label="Failure rate" value={formatPercent(totals.rates.failure)} />
            <MiniStat label="Pending rate" value={formatPercent(totals.rates.pending)} />
            <MiniStat label="Visitor → payment attempt" value={formatPercent(totals.rates.visitorToAttempt)} />
            <MiniStat label="Visitor → paid" value={formatPercent(totals.rates.visitorToPaid, 2)} />
          </div>
          <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MiniStat label="Revenue (successful)" value={formatCurrency(totals.revenue)} />
            <MiniStat label="Successful payments" value={formatNumber(totals.successfulPayments)} />
            <MiniStat label="Avg. transaction value" value={formatCurrency(totals.avgTransactionValue)} />
            <MiniStat label="Autopay renewals" value={formatNumber(totals.renewals)} />
            <MiniStat label="Renewal revenue" value={formatCurrency(totals.renewalRevenue)} />
          </div>
        </Panel>
        <Panel title="Payment status" subtitle="Share of all payment attempts.">
          <PaymentStatusBar totals={totals} />
        </Panel>
      </div>

      {/* 5. Daily report */}
      <SectionHeading title="Daily report" description="What happened on each day of the selected period." />
      <Panel title="Date-wise breakdown">
        <DailyReportTable rows={dailyRows} totals={totals} />
      </Panel>

      {/* 7. Marketing */}
      <SectionHeading title="Marketing" description="Which sources and campaigns bring visitors and payments." />
      <Panel title="UTM campaign performance" subtitle="Visits, content clicks and payments from each campaign's visits. Conversions are visits that ended in a successful payment.">
        <UtmCampaignTable rows={utmCampaigns} />
      </Panel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MARKETING_PANELS.map((panel) => (
          <Panel key={panel.dimension} title={panel.title} subtitle={panel.subtitle}>
            {loading && !breakdowns[panel.dimension] ? (
              <div className="py-8 text-center text-sm text-[#898781]">Loading…</div>
            ) : (
              <RankedBarList data={breakdowns[panel.dimension]} />
            )}
          </Panel>
        ))}
      </div>

      {/* 6. Visitor timeline */}
      <SectionHeading title="Recent visits" description="The latest sessions in this period." />
      <Panel
        title="Visit timeline"
        action={(
          <Link to="/analytics/visitors" className="text-xs font-medium text-[#6fa8f0] hover:text-white transition-colors">
            View visitor table &amp; export CSV →
          </Link>
        )}
      >
        <VisitorTimeline sessions={recentSessions} loading={loading} />
      </Panel>

      {/* Existing engagement + audience analytics (real data) */}
      <SectionHeading title="Engagement & audience" description="Site engagement and where your audience comes from." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Returning Visitors" value={show(formatNumber(summary?.returningVisitors))} />
        <StatCard label="Avg. Session Duration" value={ready ? formatDuration(summary.avgSessionDuration) : '—'} />
        <StatCard label="Bounce Rate" value={ready ? `${summary.bounceRate}%` : '—'} />
        <StatCard label="Conversions" value={show(formatNumber(summary?.conversions))} />
      </div>

      <Panel
        title="Engagement trend"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={trendMetric}
              onChange={(e) => setTrendMetric(e.target.value)}
              aria-label="Metric"
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-[#c3c2b7]"
            >
              {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <GranularityToggle value={granularity} onChange={setGranularity} />
          </div>
        )}
      >
        {loading && trendSeries.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-[#898781]">Loading…</div>
        ) : (
          <TrendChart data={engagementChartData} />
        )}
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {BREAKDOWN_PANELS.filter((panel) => !MARKETING_DIMENSIONS.has(panel.dimension)).map((panel) => (
          <Panel key={panel.dimension} title={panel.title}>
            {loading && !breakdowns[panel.dimension] ? (
              <div className="py-8 text-center text-sm text-[#898781]">Loading…</div>
            ) : (
              <RankedBarList data={breakdowns[panel.dimension]} />
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
};

export default AnalyticsOverview;
