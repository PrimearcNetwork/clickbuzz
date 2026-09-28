// Marks numbers that are placeholders (metrics not tracked yet — see
// data/reportModel.js SAMPLE_FIELDS), so they're never mistaken for
// production data. Neutral styling on purpose: it must not look like a status.
const SampleBadge = ({ className = '' }) => (
  <span
    title="Placeholder values — this metric isn't tracked yet"
    className={`inline-flex items-center gap-1 rounded-full border border-dashed border-white/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#898781] whitespace-nowrap ${className}`}
  >
    Sample data
  </span>
);

export default SampleBadge;
