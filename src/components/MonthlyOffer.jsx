import { Tag } from 'lucide-react';
import monthlyMobileBg from '../assets/monthly-login-bg.jpg';

// Campaign design for monthly.clickbuz.in on phones, shared by LoginPage and
// PlansPage so the visitor never sees the standard login card / Explore Plans
// page in this flow (see utils/monthlyOffer.js).

// Full-screen artwork with the glass card pinned to the bottom. `fixed` +
// z-[60] so it also covers the Navbar/Sidebar that wrap /plans.
export const MonthlyOfferScreen = ({ children }) => (
  <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
    <img
      src={monthlyMobileBg}
      alt=""
      data-testid="monthly-offer-bg"
      className="fixed inset-0 w-full h-full object-cover object-top select-none"
      draggable={false}
      decoding="async"
    />
    <div className="relative min-h-full flex flex-col justify-end px-4 pt-[32dvh] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="auth-card-enter w-full max-w-md mx-auto rounded-3xl border border-white/25 border-t-2 border-t-[#ff4d1a] px-4 pt-7 pb-6">
        <h1 className="text-center text-white font-bold text-[15px] leading-relaxed mb-6 px-2 [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
          Unlock All Premium Content at Half the Price!{' '}
          <span className="text-[#22c55e] text-lg font-extrabold whitespace-nowrap">FLAT 50% OFF</span>
        </h1>
        {children}
      </div>
    </div>
  </div>
);

export const MonthlyPlanBox = ({ price }) => (
  <div className="mt-6 rounded-2xl border border-white/40 px-6 py-4 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)] flex items-start justify-between gap-3">
    <div>
      <p className="text-white text-sm mb-1">Monthly Plan</p>
      <p className="flex items-baseline gap-2">
        <span className="text-white font-bold text-3xl">₹{price}</span>
        <span className="text-white/85 text-xs line-through">Save {price}</span>
      </p>
    </div>
    <span className="flex items-center gap-1 rounded-full bg-[#e11d2e] text-white text-[10px] font-bold px-3 py-1.5 whitespace-nowrap">
      <Tag size={11} />
      50% OFF
    </span>
  </div>
);
