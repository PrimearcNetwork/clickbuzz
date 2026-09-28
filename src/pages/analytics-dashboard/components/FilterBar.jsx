import { SlidersHorizontal } from 'lucide-react';

// Dimension filters planned for the report. None of them is connected to a
// data source yet, so they're rendered disabled with a clear note rather
// than pretending to filter anything. When one is wired up, pass `options`
// and an `onChange` for it and drop `disabled`.
const FILTERS = [
  { key: 'utmSource', label: 'UTM source', placeholder: 'All sources' },
  { key: 'utmMedium', label: 'UTM medium', placeholder: 'All mediums' },
  { key: 'utmCampaign', label: 'UTM campaign', placeholder: 'All campaigns' },
  { key: 'userType', label: 'User type', placeholder: 'All users' },
  { key: 'paymentStatus', label: 'Payment status', placeholder: 'All statuses' },
  { key: 'contentType', label: 'Content type', placeholder: 'All types' },
  { key: 'screen', label: 'Screen / page', placeholder: 'All screens' },
  { key: 'domain', label: 'Domain', placeholder: 'All domains' },
];

const FilterBar = () => (
  <div className="bg-[#12161f] border border-white/10 rounded-xl p-4">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white">
        <SlidersHorizontal size={14} aria-hidden="true" /> Filters
      </div>
      <span className="text-xs text-[#898781]">Not connected yet — these don’t filter the data below.</span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {FILTERS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-xs text-[#898781] min-w-0">
          {f.label}
          <select disabled className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[#898781] cursor-not-allowed">
            <option>{f.placeholder}</option>
          </select>
        </label>
      ))}
    </div>
  </div>
);

export default FilterBar;
