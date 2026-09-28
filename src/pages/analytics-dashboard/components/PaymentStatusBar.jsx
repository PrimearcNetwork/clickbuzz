import { CheckCircle2, XCircle, Clock, Ban } from 'lucide-react';
import { STATUS_GOOD, STATUS_CRITICAL, STATUS_WARNING, STATUS_SERIOUS } from '../vizTheme';
import { formatNumber, formatPercent } from '../data/reportModel';

// Part-to-whole of payment attempts by status: a segmented 100% bar with
// 2px surface gaps between segments, using the reserved status palette —
// every color is paired with an icon + label + count, never color alone.
const PAYMENT_STATUSES = [
  { key: 'successfulPayments', label: 'Successful', color: STATUS_GOOD, icon: CheckCircle2 },
  { key: 'pendingPayments', label: 'Pending', color: STATUS_WARNING, icon: Clock },
  { key: 'cancelledPayments', label: 'Cancelled', color: STATUS_SERIOUS, icon: Ban },
  { key: 'failedPayments', label: 'Failed', color: STATUS_CRITICAL, icon: XCircle },
];

const PaymentStatusBar = ({ totals }) => {
  const total = PAYMENT_STATUSES.reduce((sum, s) => sum + (totals[s.key] || 0), 0);

  if (total === 0) {
    return <div className="py-8 text-center text-sm text-[#898781]">No payment attempts in this period</div>;
  }

  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] rounded-full overflow-hidden" role="img" aria-label="Payment attempts by status">
        {PAYMENT_STATUSES.filter((s) => totals[s.key] > 0).map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${formatNumber(totals[s.key])} (${formatPercent((totals[s.key] / total) * 100)})`}
            style={{ width: `${(totals[s.key] / total) * 100}%`, backgroundColor: s.color }}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {PAYMENT_STATUSES.map((s) => (
          <li key={s.key} className="flex items-start gap-2 min-w-0">
            <s.icon size={16} style={{ color: s.color }} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs text-[#898781]">{s.label}</div>
              <div className="text-sm text-white font-medium tabular-nums">
                {formatNumber(totals[s.key])}
                <span className="ml-1.5 text-xs font-normal text-[#898781]">{formatPercent(((totals[s.key] || 0) / total) * 100)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PaymentStatusBar;
