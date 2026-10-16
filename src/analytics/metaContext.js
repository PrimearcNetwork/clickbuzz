// Builds the metadata every Meta Pixel event gets enriched with. Visitor ID
// (localStorage, persists across visits) and session ID (sessionStorage,
// one per tab) are deliberately independent of tracker.js's own visitor/
// session IDs — tracker.js doesn't export its identifiers, and coupling to
// its private localStorage format would be fragile. These IDs exist only to
// give Meta's own event stream internal consistency, not to cross-reference
// against the first-party analytics DB.
import { randomUUID } from '../utils/uuid';

const VISITOR_ID_KEY = 'clickbuz_meta_visitor_id';
const SESSION_ID_KEY = 'clickbuz_meta_session_id';

function getOrCreateId(storage, key) {
    try {
        let id = storage.getItem(key);
        if (!id) {
            id = randomUUID();
            storage.setItem(key, id);
        }
        return id;
    } catch {
        // storage full/disabled — fall back to a per-call id rather than throwing.
        return randomUUID();
    }
}

function getUtmParams() {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    ['source', 'medium', 'campaign', 'term', 'content'].forEach((key) => {
        const value = params.get(`utm_${key}`);
        if (value) utm[`utm_${key}`] = value;
    });
    return utm;
}

export function buildMetaContext() {
    if (typeof window === 'undefined') {
        return { pageUrl: '', pageTitle: '', referrer: '', utm: {}, visitorId: null, sessionId: null, timestamp: Date.now() };
    }
    return {
        pageUrl: window.location.href,
        pageTitle: document.title,
        referrer: document.referrer || '',
        utm: getUtmParams(),
        visitorId: getOrCreateId(window.localStorage, VISITOR_ID_KEY),
        sessionId: getOrCreateId(window.sessionStorage, SESSION_ID_KEY),
        timestamp: Date.now(),
    };
}
