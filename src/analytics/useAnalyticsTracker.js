import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageview } from './tracker';
import { loadGoogleAnalytics, loadGoogleTagManager, trackGaPageview } from './gaLoader';
import { deferToIdle } from './deferToIdle';
import { captureClickId } from './affiliateClickId';
import { applyInternalFlagFromUrl } from './internalTraffic';
import { installContentClickTracking } from './contentClickTracking';

// Paths this analytics module deliberately never tracks as visitor traffic:
// the admin CMS and the analytics dashboard itself — otherwise the site
// owner's own tool usage would pollute their own visitor data.
const EXCLUDED_PREFIXES = ['/admin', '/analytics'];

function isExcluded(pathname) {
    return EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Mounted once at the app root (see App.jsx's <AnalyticsBoundary />) — fires
// a pageview on first mount and again on every client-side route change,
// since this is an SPA and there's no full page load between routes for a
// traditional beacon to hook into.
export function useAnalyticsTracker() {
    const location = useLocation();
    // React (dev-mode StrictMode) double-invokes effects on mount as a
    // diagnostic — harmless for a typical read-only fetch-in-effect (this
    // codebase's usual pattern, see CLAUDE.md §5), but this effect *creates*
    // a pageview record each time it runs, so back-to-back invocations for
    // the exact same location would otherwise double-count it. This ref
    // only suppresses an immediate repeat of the same location — navigating
    // away and back to the same URL later still tracks normally.
    const lastTrackedKey = useRef(null);

    useEffect(() => {
        // GA4/GTM are third-party, non-critical to this app's own UI — defer
        // their script injection off the critical path (see deferToIdle.js).
        // This app's own first-party pageview (trackPageview, below) is
        // unaffected — it's not a third-party script and stays immediate.
        deferToIdle(() => {
            loadGoogleAnalytics();
            loadGoogleTagManager();
        });
        installContentClickTracking();
    }, []);

    // Independent of the pageview dedup/exclusion logic below — an affiliate
    // link could in principle land on any path, and capturing is idempotent
    // (a no-op whenever the URL has no click_id), so it just runs on every
    // navigation rather than sharing the pageview effect's guards.
    useEffect(() => {
        captureClickId();
        // ?cb_internal=1 / 0 — must run before the pageview effect below.
        applyInternalFlagFromUrl();
    }, [location.pathname, location.search]);

    useEffect(() => {
        if (isExcluded(location.pathname)) return;

        const key = `${location.pathname}${location.search}`;
        if (lastTrackedKey.current === key) return;
        lastTrackedKey.current = key;

        const url = `${window.location.origin}${location.pathname}${location.search}`;
        const title = document.title;
        trackPageview(url, title);
        trackGaPageview(url, title);
    }, [location.pathname, location.search]);
}
