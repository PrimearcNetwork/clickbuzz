import { Link } from 'react-router-dom';

// Latest sessions from the existing GET /api/analytics/visitors endpoint —
// all real data, same fields the Visitors page already shows (hashed-IP
// architecture: no raw IPs, only the anonymous visitor ID, shortened here).
// Logged-in/guest and per-visit payment status aren't tracked per session
// yet, so they're not shown rather than invented.
const formatTime = (value) => {
  const d = new Date(value);
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
};

const VisitorTimeline = ({ sessions, loading }) => {
  if (loading && !sessions.length) {
    return <div className="py-8 text-center text-sm text-[#898781]">Loading…</div>;
  }
  if (!sessions.length) {
    return <div className="py-8 text-center text-sm text-[#898781]">No visits in this period</div>;
  }

  return (
    <div className="overflow-x-auto -mx-4 md:-mx-5 px-4 md:px-5">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-left text-[#898781] text-xs uppercase tracking-wide border-b border-white/10">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Visitor</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Source</th>
            <th className="py-2 pr-4 font-medium">Campaign</th>
            <th className="py-2 pr-4 font-medium">Landing page</th>
            <th className="py-2 pr-4 font-medium text-right">Pages</th>
            <th className="py-2 font-medium text-right">Converted</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const t = formatTime(s.date);
            return (
              <tr key={s.sessionId} className="border-b border-white/5 last:border-0">
                <td className="py-2 pr-4 whitespace-nowrap">
                  <span className="text-white">{t.date}</span>
                  <span className="ml-2 text-[#898781] tabular-nums">{t.time}</span>
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <Link to={`/analytics/visitors/${encodeURIComponent(s.visitorId)}`} className="font-mono text-xs text-[#6fa8f0] hover:text-white">
                    {String(s.visitorId).slice(0, 8)}…
                  </Link>
                </td>
                <td className="py-2 pr-4 text-[#c3c2b7] whitespace-nowrap">{s.isReturning ? 'Returning' : 'New'}</td>
                <td className="py-2 pr-4 text-[#c3c2b7] whitespace-nowrap capitalize">{(s.source || 'direct').replace(/_/g, ' ')}</td>
                <td className="py-2 pr-4 text-[#c3c2b7] whitespace-nowrap">{s.campaign || '—'}</td>
                <td className="py-2 pr-4 text-[#c3c2b7] max-w-[220px] truncate" title={s.landingPage || ''}>{s.landingPage || '—'}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-white">{s.pagesViewed ?? '—'}</td>
                <td className="py-2 text-right text-[#c3c2b7]">{s.conversion ? 'Yes' : 'No'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default VisitorTimeline;
