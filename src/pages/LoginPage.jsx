import { useEffect, useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth, setDemoSession, markPaid } from '../hooks/useAuth';
import { plansApi, paymentsApi, siteSettingsApi } from '../services/api';
import { loadRazorpayCheckout } from '../services/razorpayCheckout';
import defaultBanner from '../assets/explore-plans-banner.png';

// India-only — any 10-digit number is accepted, no leading-digit restriction.
const COUNTRY_CODE = '+91';

const isValidPhone = (digits) => /^\d{10}$/.test(digits);

const LoginPage = () => {
  const [phoneDigits, setPhoneDigits] = useState('');
  const [loading, setLoading] = useState(false);
  // null = still loading; [] = loaded (or failed) with nothing usable.
  // Prefetched on mount so it can be handed to the Explore Plans page
  // without a second round trip.
  const [plans, setPlans] = useState(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Same banner as the Explore Plans page (PlansPage.jsx): the admin-uploaded
  // desktop/mobile images from Admin → Plans → "Explore Plans Banner" when
  // set, otherwise the built-in default.
  const [banner, setBanner] = useState({ desktop: null, mobile: null });
  useEffect(() => {
    siteSettingsApi
      .getAll()
      .then((settings) => setBanner({
        desktop: settings.explore_plans_bg_desktop || null,
        mobile: settings.explore_plans_bg_mobile || null,
      }))
      .catch((err) => console.error('Banner settings fetch failed:', err));
  }, []);

  // Best-effort preload, fired the instant this screen mounts: most people
  // who land here are about to pay, so by the time "Pay Now" is tapped on
  // the Explore Plans page, Razorpay's Checkout.js is very likely already
  // loaded — removing that network round trip from the critical path to the
  // modal opening. handlePayNow's own loadRazorpayCheckout() call (in
  // PlansPage.jsx) still runs and will retry/surface a real error if this
  // preload failed or hasn't finished yet.
  useEffect(() => {
    loadRazorpayCheckout().catch(() => {});
    plansApi.getAll(true).then(setPlans).catch((err) => {
      console.error('Plans fetch failed:', err);
      setPlans([]);
    });
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const valid = isValidPhone(phoneDigits);
  const bannerSrc = banner.desktop || banner.mobile || defaultBanner;

  const handleProceed = async (e) => {
    e.preventDefault();
    if (!valid || loading) return;

    setLoading(true);
    const fullPhoneNumber = `${COUNTRY_CODE}${phoneDigits}`;

    // Any number that passes the format check above logs in — no OTP step,
    // no fixed account list.
    setDemoSession(fullPhoneNumber);

    // A returning customer who already has an active (paid, unexpired)
    // subscription for this phone number shouldn't be asked to pay again on
    // every login — see backend/controllers/payment.controller.js's
    // getSubscriptionStatus and CLAUDE.md's Payment/Subscription models.
    // This is a real DB lookup, not the localStorage-only demo flag alone.
    //
    // Reuses the plans already fetched on mount when available; falls back to fetching again here on the off
    // chance that request hasn't resolved yet or failed. Either way this
    // runs in parallel with the subscription-status check, not after it —
    // most logins are NOT already-subscribed, so the plan list is needed
    // almost every time, and fetching it only after learning that would
    // just add a second sequential round trip PlansPage.jsx would otherwise
    // have to make itself before Razorpay can open.
    const plansPromise = plans && plans.length > 0 ? Promise.resolve(plans) : plansApi.getAll(true);
    const [statusResult, plansResult] = await Promise.allSettled([
      paymentsApi.getSubscriptionStatus(phoneDigits),
      plansPromise,
    ]);

    if (statusResult.status === 'fulfilled' && statusResult.value.active) {
      markPaid();
      setLoading(false);
      navigate('/');
      return;
    }
    if (statusResult.status === 'rejected') {
      console.error('Subscription status check failed:', statusResult.reason);
      // Fail safe to the paywall rather than silently granting access if
      // the check itself errored out.
    }

    setLoading(false);
    // Explore Plans page (Monthly plan only) — payment starts when the user
    // taps "Pay Now" there. Handing over the already-fetched plans (when that
    // succeeded) lets it skip re-fetching them itself.
    navigate('/plans', {
      state: {
        plans: plansResult.status === 'fulfilled' ? plansResult.value : undefined,
      },
    });
  };

  return (
    <div className="min-h-dvh bg-bg-dark flex items-center justify-center px-4 py-6 sm:py-10">
      <div className="auth-card-enter w-full max-w-sm sm:max-w-md bg-[#090d16] border border-brand/20 rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(0,168,225,0.12)]">
        {/* Banner — full card width, natural height, so it's never cropped on
            any screen size (same artwork as the Explore Plans page). */}
        <picture className="block w-full bg-black">
          {banner.mobile && <source media="(max-width: 767px)" srcSet={banner.mobile} />}
          {banner.desktop && <source media="(min-width: 768px)" srcSet={banner.desktop} />}
          <img
            src={bannerSrc}
            alt=""
            data-testid="login-banner"
            className="block w-full h-auto select-none"
            draggable={false}
            decoding="async"
          />
        </picture>

        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
          <h1 className="text-center text-white font-bold text-xl sm:text-2xl mb-2">Welcome to ClickBuz</h1>
          <p className="text-center text-gray-400 text-sm mb-6 sm:mb-8 leading-relaxed">
            Enter your mobile number to sign in or create an account.
          </p>

          <form onSubmit={handleProceed} className="space-y-5">
            <div>
              <div className="flex items-center bg-bg-lighter border border-gray-700 focus-within:border-brand rounded-xl overflow-hidden transition-colors">
                <span className="px-4 py-3.5 text-white text-sm font-medium border-r border-gray-700 whitespace-nowrap shrink-0">
                  IN {COUNTRY_CODE}
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="Mobile number"
                  className="w-full bg-transparent text-white px-4 py-3.5 outline-none placeholder-gray-500 tracking-wide"
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!valid || loading}
              className={`w-full py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                valid && !loading
                  ? 'bg-brand hover:bg-brand-hover text-white shadow-lg shadow-brand/20 active:scale-[0.98]'
                  : 'bg-gray-700/60 text-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Please wait…
                </>
              ) : (
                'Proceed'
              )}
            </button>
          </form>

          <p className="mt-6 sm:mt-8 text-center text-xs text-gray-500 leading-relaxed px-2">
            By continuing you agree to our{' '}
            <Link to="/page/terms-and-conditions" className="text-brand hover:underline">Terms and Conditions</Link> and acknowledge that you
            have read our <Link to="/page/privacy-policy" className="text-brand hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
