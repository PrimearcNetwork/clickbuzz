// Shared by the Overview and Visitors pages. Presets are day offsets
// (0 = today). The active preset is highlighted; editing the dates by hand
// is the custom range.
const PRESETS = [
  { label: 'Today', fromOffset: 0, toOffset: 0 },
  { label: 'Yesterday', fromOffset: 1, toOffset: 1 },
  { label: '7D', fromOffset: 6, toOffset: 0 },
  { label: '30D', fromOffset: 29, toOffset: 0 },
  { label: '90D', fromOffset: 89, toOffset: 0 },
];

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function presetRange(preset) {
  const now = Date.now();
  return {
    from: toISODate(new Date(now - preset.fromOffset * 86400000)),
    to: toISODate(new Date(now - preset.toOffset * 86400000)),
  };
}

const DateRangeFilter = ({ from, to, onChange }) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="flex flex-wrap rounded-lg border border-white/10 overflow-hidden" role="group" aria-label="Date range presets">
      {PRESETS.map((preset) => {
        const range = presetRange(preset);
        const active = range.from === from && range.to === to;
        return (
          <button
            key={preset.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(range)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-[#3987e5]/20 text-[#6fa8f0]' : 'text-[#c3c2b7] hover:bg-white/5 hover:text-white'}`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
    <div className="flex items-center gap-1.5 text-xs text-[#898781]">
      <input
        type="date"
        aria-label="From date"
        value={from}
        max={to}
        onChange={(e) => e.target.value && onChange({ from: e.target.value, to })}
        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[#c3c2b7]"
      />
      <span>to</span>
      <input
        type="date"
        aria-label="To date"
        value={to}
        min={from}
        onChange={(e) => e.target.value && onChange({ from, to: e.target.value })}
        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[#c3c2b7]"
      />
    </div>
  </div>
);

export default DateRangeFilter;
