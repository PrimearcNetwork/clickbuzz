// Optional Google Analytics 4 / Google Tag Manager loader — purely additive
// complements to this app's own analytics module (see CLAUDE.md §23), never
// a dependency of it. Both are entirely config-driven: with no measurement
// ID / container ID set, nothing is injected into the page at all.

import { isInternalDevice } from './internalTraffic';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const GTM_CONTAINER_ID = import.meta.env.VITE_GTM_CONTAINER_ID;

let gaLoaded = false;
let gtmLoaded = false;

function injectScript(src, attrs = {}) {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    Object.entries(attrs).forEach(([key, value]) => script.setAttribute(key, value));
    document.head.appendChild(script);
    return script;
}

export function loadGoogleAnalytics() {
    if (gaLoaded || !GA_MEASUREMENT_ID || typeof window === 'undefined' || isInternalDevice()) return;
    gaLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args) {
        window.dataLayer.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false }); // we forward page_views ourselves, see trackGaPageview

    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`);
}

export function loadGoogleTagManager() {
    if (gtmLoaded || !GTM_CONTAINER_ID || typeof window === 'undefined' || isInternalDevice()) return;
    gtmLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    injectScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_CONTAINER_ID)}`);

    // GTM's <noscript> fallback iframe — normally hand-placed right after
    // <body>; injected here instead since this ID is only known at runtime
    // (build-time env var), not something to hardcode into index.html.
    const noscript = document.createElement('noscript');
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(GTM_CONTAINER_ID)}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);
}

export function trackGaPageview(url, title) {
    if (!gaLoaded || typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', { page_location: url, page_title: title });
}

export function trackGaEvent(eventName, params = {}) {
    if (!gaLoaded || typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, params);
}
