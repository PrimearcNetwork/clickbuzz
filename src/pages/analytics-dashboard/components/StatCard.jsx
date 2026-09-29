import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { STATUS_GOOD, STATUS_CRITICAL } from '../vizTheme';

// `delta` (% vs previous period), `goodWhen` and `icon` are
// optional — existing callers (label/value/hint) render exactly as before.
// Delta text stays in secondary ink; only the arrow carries the good/bad
// color, so meaning never rests on color alone.
const StatCard = ({ label, value, hint, delta = null, goodWhen = 'up', icon: Icon }) => {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const isUp = hasDelta && delta >= 0;
  const isGood = hasDelta && (goodWhen === 'up' ? isUp : !isUp);
  const Arrow = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="bg-[#12161f] border border-white/10 rounded-xl p-4 md:p-5 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-[#898781] leading-snug">{label}</div>
        {Icon ? <Icon size={16} className="text-[#898781] shrink-0" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2 text-2xl md:text-3xl font-semibold text-white tabular-nums">{value}</div>
      {hasDelta ? (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-[#c3c2b7]">
          <Arrow size={14} style={{ color: isGood ? STATUS_GOOD : STATUS_CRITICAL }} aria-hidden="true" />
          <span className="tabular-nums">{isUp ? '+' : ''}{delta.toFixed(1)}%</span>
          <span className="text-[#898781]"><span className="hidden sm:inline">vs previous period</span><span className="sm:hidden">vs prev.</span></span>
        </div>
      ) : null}
      {hint ? <div className="mt-1 text-xs text-[#c3c2b7]">{hint}</div> : null}
    </div>
  );
};

export default StatCard;
