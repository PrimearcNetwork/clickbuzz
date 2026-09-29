import { formatNumber, formatPercent } from '../data/reportModel';

// Plain, factual statements computed from the numbers on this page — no
// interpretation or advice.
const Line = ({ children }) => (
  <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 border-b border-white/5 last:border-0 text-sm text-[#c3c2b7]">
    <span>{children}</span>
  </li>
);

const Strong = ({ children }) => <span className="text-white font-semibold tabular-nums">{children}</span>;

const SummaryInsights = ({ totals, visitorsChange }) => {
  const trend = visitorsChange === null || visitorsChange === undefined
    ? null
    : visitorsChange >= 0 ? 'up' : 'down';

  return (
    <ul>
      <Line>
        <Strong>{formatNumber(totals.visitors)}</Strong> visits from <Strong>{formatNumber(totals.uniqueVisitors)}</Strong> unique visitors
        {trend ? <> — {trend} <Strong>{formatPercent(Math.abs(visitorsChange))}</Strong> vs the previous period</> : null}.
      </Line>
      <Line>
        <Strong>{formatNumber(totals.loggedInUsers)}</Strong> logged in ({formatPercent(totals.rates.visitorToLogin)} of visitors); <Strong>{formatNumber(totals.contentClicks)}</Strong> content clicks by <Strong>{formatNumber(totals.engagedVisitors)}</Strong> visitors.
      </Line>
      <Line>
        <Strong>{formatNumber(totals.paymentAttempts)}</Strong> payment attempts ({formatPercent(totals.rates.visitorToAttempt)} of visitors).
      </Line>
      <Line>
        <Strong>{formatNumber(totals.successfulPayments)}</Strong> successful ({formatPercent(totals.rates.attemptToSuccess)} of attempts), <Strong>{formatNumber(totals.failedPayments)}</Strong> failed, <Strong>{formatNumber(totals.pendingPayments)}</Strong> pending.
      </Line>
      <Line>
        Visitor-to-paid conversion is <Strong>{formatPercent(totals.rates.visitorToPaid, 2)}</Strong>; <Strong>{formatNumber(totals.notCompleted)}</Strong> people started paying but didn’t complete.
      </Line>
    </ul>
  );
};

export default SummaryInsights;
