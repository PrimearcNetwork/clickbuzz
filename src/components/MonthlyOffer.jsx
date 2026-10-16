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
      <div className="auth-card-enter w-full max-w-md mx-auto rounded-3xl border border-white/20 border-t-2 border-t-[#ff4d1a] bg-white/10 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)] px-4 pt-7 pb-6">
        <h1 className="text-center text-white/90 font-bold text-[15px] leading-relaxed mb-6 px-2 drop-shadow">
          Unlock All Premium Content at Half the Price!{' '}
          <span className="text-[#22c55e] text-lg font-extrabold whitespace-nowrap">FLAT 50% OFF</span>
        </h1>
        {children}
      </div>
    </div>
  </div>
);

export const MonthlyPlanBox = ({ price }) => (
  <div className="mt-6 rounded-2xl border border-white/30 bg-white/15 px-6 py-4 flex items-start justify-between gap-3">
    <div>
      <p className="text-white/90 text-sm mb-1">Monthly Plan</p>
      <p className="flex items-baseline gap-2">
        <span className="text-white font-bold text-3xl">₹{price}</span>
        <span className="text-white/70 text-xs line-through">Save {price}</span>
      </p>
    </div>
    <span className="flex items-center gap-1 rounded-full bg-[#e11d2e] text-white text-[10px] font-bold px-3 py-1.5 whitespace-nowrap">
      <Tag size={11} />
      50% OFF
    </span>
  </div>
);
