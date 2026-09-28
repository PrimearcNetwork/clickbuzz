import { ArrowDown } from 'lucide-react';
import SampleBadge from './SampleBadge';
import { SEQUENTIAL_HUE } from '../vizTheme';
import { formatNumber, formatPercent } from '../data/reportModel';

// Visitor → interaction → payment attempt → success. Every stage is the
// same measure (people) at decreasing magnitude, so it's one hue throughout
// (sequential), bar length proportional to the first stage. Between stages:
// the share that continued. Values and labels stay in text ink.
const ConversionFunnel = ({ stages }) => {
  const top = Math.max(stages[0]?.value || 0, 1);

  return (
    <ol className="space-y-1">
      {stages.map((stage, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const stepRate = prev ? (stage.value / prev) * 100 : null;
        const overall = i > 0 ? (stage.value / top) * 100 : 100;
        return (
          <li key={stage.key}>
            {i > 0 ? (
              <div className="flex items-center gap-2 py-1.5 pl-1 text-xs text-[#898781]">
                <ArrowDown size={14} aria-hidden="true" />
                <span className="tabular-nums text-[#c3c2b7]">{formatPercent(stepRate)}</span>
                <span>continued</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
              <span className="flex items-center gap-2 text-sm text-[#c3c2b7]">
                {stage.label}
                {stage.sample ? <SampleBadge /> : null}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-white tabular-nums">{formatNumber(stage.value)}</span>
                {i > 0 ? <span className="text-xs text-[#898781] tabular-nums">{formatPercent(overall)} of visitors</span> : null}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden" title={`${stage.label}: ${formatNumber(stage.value)}`}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(stage.value > 0 ? 1.5 : 0, (stage.value / top) * 100)}%`, backgroundColor: SEQUENTIAL_HUE }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default ConversionFunnel;
