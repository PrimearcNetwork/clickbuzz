// `subtitle` is an optional addition — existing callers
// (title/action/children/className) render exactly as before.
const Panel = ({ title, subtitle, action, children, className = '' }) => (
  <div className={`bg-[#12161f] border border-white/10 rounded-xl p-4 md:p-5 min-w-0 ${className}`}>
    <div className="flex flex-wrap items-start justify-between mb-4 gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-[#898781]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    {children}
  </div>
);

export default Panel;
