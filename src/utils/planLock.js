// Plan lock for the marketing subdomains: weekly.clickbuz.in and
// monthly.clickbuz.in 302-redirect to https://clickbuz.in/login?plan=<cycle>
// (see deploy/nginx/clickbuz.conf). The cycle is remembered here so the
// Explore Plans page (PlansPage.jsx) offers only that one plan.
//
// localStorage (same as the affiliate click_id) so the lock survives a closed
// tab or a UPI app switch before the visitor pays. A URL without `plan`
// leaves the stored value alone; a new valid `plan` overwrites it.
const PLAN_LOCK_KEY = 'clickbuz_plan_lock';
const ALLOWED_CYCLES = ['WEEKLY', 'MONTHLY'];

const isValidCycle = (value) => typeof value === 'string' && ALLOWED_CYCLES.includes(value);

// Called once at boot (main.jsx) — the subdomain redirect is always a full
// page load.
export function capturePlanLock() {
    if (typeof window === 'undefined') return;

    const raw = new URLSearchParams(window.location.search).get('plan');
    if (!raw) return;

    const cycle = raw.toUpperCase();
    if (!isValidCycle(cycle)) {
        console.warn('[PlanLock] Ignoring unknown plan query param');
        return;
    }

    try {
        window.localStorage.setItem(PLAN_LOCK_KEY, cycle);
    } catch {
        // storage disabled — the visitor just sees the normal plan picker.
    }
}

// 'WEEKLY' | 'MONTHLY' | null. Re-validated on read.
export function getPlanLock() {
    try {
        const value = window.localStorage.getItem(PLAN_LOCK_KEY);
        return isValidCycle(value) ? value : null;
    } catch {
        return null;
    }
}
