// Core analytics client — isolated from the rest of the app (see CLAUDE.md
// §23). No React here on purpose: this is a plain browser client so it can
// be unit-tested/reused outside React later; useAnalyticsTracker.js is the
// only file that wires it into the router.
//
// Every network call uses fetch(..., { keepalive: true }) — see sendHits()
// below for why that's used instead of navigator.sendBeacon() — so tracking
// never blocks page navigation or unload; this is what makes "never slow
// down the website" true on the client side, mirroring how the backend
// never does tracking work inline with the request/response cycle either
// (see backend/services/analytics/eventBuffer.service.js).

import { isInternalDevice } from './internalTraffic';

const COLLECT_ENDPOINT = `${import.meta.env.VITE_API_URL}/api/analytics/collect`;

const VISITOR_KEY = 'clickbuz_analytics_visitor_id';
const SESSION_KEY = 'clickbuz_analytics_session';

// GA-style rolling inactivity window: a visit that resumes within 30 minutes
// continues the same session; otherwise a new one starts.
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 20 * 1000;

// The consumer login session (src/hooks/useAuth.js) — read directly so this
// file stays React-free.
const LOGIN_SESSION_KEY = 'clickbuz_demo_session';

let visitorId = null;
let currentSessionId = null;
let currentPageUrl = null;
let heartbeatTimer = null;
let unloadHandlersAttached = false;

function safeGet(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null; // private browsing / storage disabled — degrade silently
    }
}

function safeSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // ignore — nothing meaningful to recover here
    }
}

function getOrCreateVisitorId() {
    let id = safeGet(VISITOR_KEY);
    if (!id) {
        id = crypto.randomUUID();
        safeSet(VISITOR_KEY, id);
    }
    return id;
}

function readSessionState() {
    const raw = safeGet(SESSION_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function writeSessionState(state) {
    safeSet(SESSION_KEY, JSON.stringify(state));
}

// Returns { sessionId, isNew }. Persisted in localStorage (not
// sessionStorage) so the 30-minute rule survives a tab close/reopen — a
// closed-then-reopened tab within 30 minutes is still the same visit.
function getOrCreateSession() {
    const now = Date.now();
    const stored = readSessionState();
    if (stored && now - stored.lastActivityAt < SESSION_TIMEOUT_MS) {
        stored.lastActivityAt = now;
        writeSessionState(stored);
        return { sessionId: stored.sessionId, startedAt: stored.startedAt, isNew: false };
    }
    const sessionId = crypto.randomUUID();
    const state = { sessionId, startedAt: now, lastActivityAt: now };
    writeSessionState(state);
    return { sessionId, startedAt: now, isNew: true };
}

function touchSession() {
    const stored = readSessionState();
    if (stored) {
        stored.lastActivityAt = Date.now();
        writeSessionState(stored);
    }
}

function parseUtmParams(search) {
    const params = new URLSearchParams(search);
    const utm = {
        utmSource: params.get('utm_source') || undefined,
        utmMedium: params.get('utm_medium') || undefined,
        utmCampaign: params.get('utm_campaign') || undefined,
        utmTerm: params.get('utm_term') || undefined,
        utmContent: params.get('utm_content') || undefined
    };
    return Object.values(utm).some(Boolean) ? utm : {};
}

function safeTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
        return null;
    }
}

function sendHits(hits) {
    if (!visitorId || !currentSessionId || hits.length === 0) return;
    // The owner's own devices never count as visitors (see internalTraffic.js).
    if (isInternalDevice()) return;

    const payload = JSON.stringify({ visitorId, sessionId: currentSessionId, hits });

    // fetch(..., { keepalive: true }) is the modern replacement for
    // navigator.sendBeacon() for exactly this "survive page unload"
    // use case — same non-blocking, request-continues-after-navigation
    // guarantee, but also lets a failure actually be caught (sendBeacon's
    // return value only ever tells you the browser accepted the request
    // into its send queue, never whether it succeeded). Deliberately not
    // using sendBeacon here: verified against this backend that identical
    // payloads succeed via fetch/fetch+keepalive but were unreliable via
    // sendBeacon in testing.
    fetch(COLLECT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
    }).catch(() => {
        // Tracking must never surface as an app-visible error.
    });
}

function ensureIdentity() {
    if (!visitorId) visitorId = getOrCreateVisitorId();
}

function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
        if (document.visibilityState !== 'visible' || !currentSessionId) return;
        touchSession();
        const stored = readSessionState();
        const durationSeconds = stored ? Math.round((Date.now() - stored.startedAt) / 1000) : 0;
        sendHits([{ type: 'heartbeat', timestamp: Date.now(), durationSeconds }]);
    }, HEARTBEAT_INTERVAL_MS);
}

function sendSessionEnd() {
    if (!currentSessionId) return;
    const stored = readSessionState();
    const durationSeconds = stored ? Math.round((Date.now() - stored.startedAt) / 1000) : 0;
    sendHits([{ type: 'session_end', timestamp: Date.now(), exitPage: currentPageUrl, durationSeconds }]);
}

function attachUnloadHandlers() {
    if (unloadHandlersAttached) return;
    unloadHandlersAttached = true;
    // pagehide is the reliable "this tab is actually going away" signal
    // (fires on navigation, tab close, and bfcache eviction) — deliberately
    // not wired to visibilitychange, since briefly switching tabs shouldn't
    // end a session that's still within the 30-minute inactivity window.
    window.addEventListener('pagehide', sendSessionEnd);
}

// Called once on app mount and again on every client-side route change.
// Bundles a session_start hit into the same request as the pageview when a
// new session begins, so a fresh visit is a single network call, not two.
export function trackPageview(url, title) {
    ensureIdentity();
    const { sessionId, isNew: isNewSession } = getOrCreateSession();
    currentSessionId = sessionId;
    currentPageUrl = url;

    const hits = [];
    if (isNewSession) {
        hits.push({
            type: 'session_start',
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language,
            timezone: safeTimezone(),
            referrerUrl: document.referrer || null,
            landingUrl: url,
            ...parseUtmParams(window.location.search)
        });
    }
    hits.push({ type: 'pageview', timestamp: Date.now(), url, pageTitle: title, loggedIn: isLoggedIn() });

    sendHits(hits);
    startHeartbeat();
    attachUnloadHandlers();
}

function isLoggedIn() {
    try {
        return Boolean(localStorage.getItem(LOGIN_SESSION_KEY));
    } catch {
        return false;
    }
}

// The current analytics visitor/session ids — sent with a checkout so the
// payment can be tied back to the visit it came from (UTM attribution,
// conversions).
export function getAnalyticsIds() {
    ensureIdentity();
    const { sessionId } = getOrCreateSession();
    currentSessionId = sessionId;
    return { visitorId, sessionId };
}

// Reusable custom-event tracker — every page/component in the app calls
// this with its own event name (see eventNames.js for the standard set);
// no schema change is ever needed for a new event.
export function trackEvent(eventName, metadata = null, options = {}) {
    ensureIdentity();
    const { sessionId } = getOrCreateSession();
    currentSessionId = sessionId;

    sendHits([{
        type: 'event',
        timestamp: Date.now(),
        eventName,
        eventCategory: options.category || null,
        pageUrl: currentPageUrl || window.location.href,
        isConversion: Boolean(options.isConversion),
        metadata
    }]);
}
