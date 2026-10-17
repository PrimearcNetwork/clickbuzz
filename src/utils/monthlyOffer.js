import { getPlanLock } from './planLock';

// monthly.clickbuz.in on phones gets the campaign design
// (components/MonthlyOffer.jsx) on both /login and /plans.
export const isMonthlyOfferFlow = (isMobile) => isMobile && getPlanLock() === 'MONTHLY';

export const monthlyPriceOf = (plans) => {
  const plan = plans?.find((p) => (p.billing_cycle || '').toUpperCase() === 'MONTHLY');
  return plan ? Math.round(Number(plan.original_price)) : 199;
};

export const OFFER_BUTTON_CLASS =
  'w-full py-4 rounded-xl font-extrabold text-white text-base transition-all flex items-center justify-center gap-2 ' +
  'bg-brand hover:bg-brand-hover shadow-lg shadow-brand/30 active:scale-[0.98] ' +
  'disabled:bg-brand/60 disabled:shadow-none disabled:active:scale-100 disabled:cursor-not-allowed';
