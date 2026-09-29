// Meta Pixel loader — fbq stub injection + script loading only, mirroring
// gaLoader.js's pattern (module-level loaded flag, own env var, no-op if
// unset). No track calls live here; see metaEvents.js for those.
import { hasMarketingConsent } from './metaConsent';
import { isInternalDevice } from './internalTraffic';

const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;
export const META_PIXEL_DEBUG = import.meta.env.VITE_META_PIXEL_DEBUG === 'true';

let metaPixelLoaded = false;

// Standard fbq stub — same semantics as Meta's own snippet, just factored
// so it can be guarded/reused instead of pasted inline in index.html. Safe
// to call more than once; fbq itself no-ops if window.fbq already exists.
function installFbqStub() {
    if (window.fbq) return;
    const n = (window.fbq = function fbq(...args) {
        n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    });
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
}

function injectScript(src) {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
    return script;
}

// Called once (from useMetaPixelTracker's mount effect). No-ops if
// VITE_META_PIXEL_ID is unset, already loaded, consent isn't granted yet,
// or there's no window (SSR). Deliberately does NOT set metaPixelLoaded on
// a consent bail-out, so a later setMarketingConsent(true) can still
// trigger a real init via the same call.
export function initializeMetaPixel() {
    if (metaPixelLoaded || !META_PIXEL_ID || typeof window === 'undefined') return;
    if (!hasMarketingConsent() || isInternalDevice()) return;
    metaPixelLoaded = true;
    try {
        installFbqStub();
        injectScript('https://connect.facebook.net/en_US/fbevents.js');
        // Per Meta's own docs (fbq('set','autoConfig',...) must run before
        // init, not as an init() argument) — opts this Pixel out of
        // automatically scraping visible form fields (e.g. the login phone
        // number) for hashed PII matching. This app's own consent gate
        // shouldn't be undermined by a background feature it never triggers.
        window.fbq('set', 'autoConfig', false, META_PIXEL_ID);
        window.fbq('init', META_PIXEL_ID);
    } catch (err) {
        // Ad-blockers, CSP, etc. — tracking must never break the app.
        if (META_PIXEL_DEBUG) console.warn('[MetaPixel] init failed:', err);
    }
}

export function isMetaPixelLoaded() {
    return metaPixelLoaded;
}
