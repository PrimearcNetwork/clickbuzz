import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_GRIDLINE, CHART_INK_MUTED, CHART_SURFACE } from '../vizTheme';

// Multi-series trend (one shared y-axis — all series are visitor counts).
// Colors come in fixed order from the caller and follow the series, never
// its position, so hiding one never repaints the others. The legend is
// always shown, doubles as the series toggle, and carries each series'
// period total next to its swatch so identity never relies on color alone.
const ChartTooltip = ({ active, payload, label, series }) => {
  if (!active || !payload || !payload.length) return null;
  const byKey = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]));
  return (
    <div className="bg-[#0d0f16] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl min-w-[160px]">
      <div className="text-[#898781] mb-1.5">{label}</div>
      {series.filter((s) => s.key in byKey).map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-[#c3c2b7]">
            <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
          <span className="text-white font-medium tabular-nums">{Number(byKey[s.key]).toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );
};

const MultiSeriesTrendChart = ({ data, series, totals = {}, height = 300 }) => {
  const [hidden, setHidden] = useState(() => new Set());
  const toggle = (key) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else if (next.size < series.length - 1) next.add(key);
    return next;
  });
  const visible = series.filter((s) => !hidden.has(s.key));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Show or hide series">
        {series.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${on ? 'border-white/15 bg-white/5 text-[#c3c2b7]' : 'border-white/5 text-[#898781] opacity-60'}`}
            >
              <span className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: on ? s.color : CHART_INK_MUTED }} />
              <span>{s.label}</span>
              {totals[s.key] !== undefined ? (
                <span className="text-white font-medium tabular-nums">{Number(totals[s.key]).toLocaleString('en-IN')}</span>
              ) : null}
              {s.sample ? <span className="text-[10px] text-[#898781]">(sample)</span> : null}
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRIDLINE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_INK_MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART_GRIDLINE }}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: CHART_INK_MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip series={series} />} cursor={{ stroke: CHART_INK_MUTED, strokeDasharray: '3 3' }} />
          {visible.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: s.color, stroke: CHART_SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MultiSeriesTrendChart;
