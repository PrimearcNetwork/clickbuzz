import { formatNumber, formatPercent } from '../data/reportModel';

// Campaign rows come from GET /api/analytics/dashboard/utm-campaigns:
// visits, conversions (visits that ended in a successful payment), content
// clicks and first-time checkouts made during that campaign's visits.
const payConversion = (row) => (row.sessions > 0 ? (row.successfulPayments / row.sessions) * 100 : 0);

const UtmCampaignTable = ({ rows }) => {
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-[#898781] py-8 text-center">No campaign data yet</div>;
  }

  return (
    <div className="overflow-x-auto -mx-4 md:-mx-5 px-4 md:px-5">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="text-left text-[#898781] text-xs uppercase tracking-wide border-b border-white/10">
            <th className="py-2 pr-4 font-medium">Campaign</th>
            <th className="py-2 pr-4 font-medium">Source</th>
            <th className="py-2 pr-4 font-medium">Medium</th>
            <th className="py-2 pr-4 font-medium text-right">Visits</th>
            <th className="py-2 pr-4 font-medium text-right">Conversions</th>
            <th className="py-2 pr-4 font-medium text-right">Clicks</th>
            <th className="py-2 pr-4 font-medium text-right">Pay attempts</th>
            <th className="py-2 pr-4 font-medium text-right">Successful</th>
            <th className="py-2 font-medium text-right">Pay conv.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
              <tr key={`${row.campaign}-${row.source}-${row.medium}-${i}`} className="border-b border-white/5 last:border-0">
                <td className="py-2 pr-4 text-white font-medium whitespace-nowrap">{row.campaign}</td>
                <td className="py-2 pr-4 text-[#c3c2b7] whitespace-nowrap">{row.source || '—'}</td>
                <td className="py-2 pr-4 text-[#c3c2b7] whitespace-nowrap">{row.medium || '—'}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-white">{row.sessions.toLocaleString('en-IN')}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-white">{row.conversions.toLocaleString('en-IN')}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-white">{formatNumber(row.contentClicks)}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-white">{formatNumber(row.paymentAttempts)}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-white">{formatNumber(row.successfulPayments)}</td>
                <td className="py-2 text-right tabular-nums text-white">{formatPercent(payConversion(row))}</td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UtmCampaignTable;
