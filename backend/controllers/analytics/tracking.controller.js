const eventBuffer = require('../../services/analytics/eventBuffer.service');
const { hashIp, getClientIp } = require('../../utils/analytics/ipHash.util');

const ALLOWED_TYPES = ['session_start', 'pageview', 'event', 'session_end', 'heartbeat'];
const MAX_HITS_PER_REQUEST = 20;
const BOT_UA_RE = /bot|spider|crawl|slurp|headless|phantomjs|curl\/|wget\/|python-requests|scrapy|facebookexternalhit|preview/i;
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = parseInt(process.env.ANALYTICS_RATE_LIMIT_PER_MINUTE, 10) || 300;
const rateLimitMap = new Map();

// Every real browser sends its own User-Agent on every HTTP request
// regardless of which hit type is in the body, so this check runs once at
// the entry point rather than only when a session_start hit happens to be
// present — cheaper and catches bots on every request type.
function isBot(userAgent) {
    return BOT_UA_RE.test(userAgent || '');
}

// Fixed-window per-IP-hash counter, entirely in-memory (per cluster worker —
// see server.js). Generous enough for real browsing (pageviews + a few
// heartbeats/events per minute) while capping how much a single client can
// force this endpoint to do, satisfying "prevent duplicate or malicious
// tracking requests" without adding a rate-limiting dependency.
function checkRateLimit(key) {
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    entry.count += 1;
    return entry.count <= RATE_LIMIT_MAX;
}

// Periodic cleanup so the map doesn't grow unbounded with one-off visitors.
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(key);
    }
}, RATE_LIMIT_WINDOW_MS);
if (cleanupTimer.unref) cleanupTimer.unref();

function truncString(value, maxLength) {
    if (typeof value !== 'string' || value.length === 0) return null;
    return value.slice(0, maxLength);
}

function sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    try {
        const json = JSON.stringify(metadata);
        // Drop rather than truncate — a truncated JSON string wouldn't parse
        // back on the dashboard side.
        return json.length <= 2000 ? metadata : null;
    } catch {
        return null;
    }
}

// Validates + clamps a single raw client hit into the shape
// eventBuffer.service.js expects. Returns null for anything malformed —
// invalid individual hits are silently dropped rather than failing the
// whole batch (one bad hit in a batch of 5 shouldn't lose the other 4).
function sanitizeHit(raw, ctx) {
    if (!raw || typeof raw !== 'object') return null;
    if (!ALLOWED_TYPES.includes(raw.type)) return null;

    let timestamp = Number(raw.timestamp);
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (!Number.isFinite(timestamp) || timestamp < ctx.now - oneDayMs || timestamp > ctx.now + 5 * 60 * 1000) {
        timestamp = ctx.now; // clamp obviously-wrong client clocks instead of rejecting
    }

    const base = { type: raw.type, visitorId: ctx.visitorId, sessionId: ctx.sessionId, timestamp, ip: ctx.ip };

    switch (raw.type) {
        case 'session_start':
            return {
                ...base,
                userAgent: truncString(raw.userAgent, 512),
                screenResolution: truncString(raw.screenResolution, 32),
                language: truncString(raw.language, 32),
                timezone: truncString(raw.timezone, 64),
                referrerUrl: truncString(raw.referrerUrl, 1024),
                landingUrl: truncString(raw.landingUrl, 512),
                utmSource: truncString(raw.utmSource, 128),
                utmMedium: truncString(raw.utmMedium, 128),
                utmCampaign: truncString(raw.utmCampaign, 128),
                utmTerm: truncString(raw.utmTerm, 128),
                utmContent: truncString(raw.utmContent, 128)
            };
        case 'pageview': {
            const url = truncString(raw.url, 512);
            if (!url) return null;
            return { ...base, url, pageTitle: truncString(raw.pageTitle, 512), loggedIn: raw.loggedIn === true };
        }
        case 'event': {
            const eventName = truncString(raw.eventName, 128);
            if (!eventName) return null;
            return {
                ...base,
                eventName,
                eventCategory: truncString(raw.eventCategory, 64),
                pageUrl: truncString(raw.pageUrl, 512),
                isConversion: Boolean(raw.isConversion),
                metadata: sanitizeMetadata(raw.metadata)
            };
        }
        case 'session_end':
            return {
                ...base,
                exitPage: truncString(raw.exitPage, 512),
                durationSeconds: Math.max(0, Number(raw.durationSeconds) || 0)
            };
        case 'heartbeat':
            return { ...base, durationSeconds: Math.max(0, Number(raw.durationSeconds) || 0) };
        default:
            return null;
    }
}

// POST /api/analytics/collect — the single ingestion endpoint every hit type
// goes through. Deliberately does no DB work inline: validates the payload's
// *shape* only, hands sanitized hits to eventBuffer.service.js, and responds
// immediately. This is what makes "never slow down the website" true even
// though the full pipeline (geolocation lookup, UA parsing, several writes)
// is comparatively heavy — none of it happens before the response is sent.
exports.collect = (req, res) => {
    try {
        if (isBot(req.headers['user-agent'])) {
            return res.status(204).end();
        }

        const ip = getClientIp(req);
        const rateLimitKey = hashIp(ip) || 'unknown';
        if (!checkRateLimit(rateLimitKey)) {
            return res.status(204).end();
        }

        const { visitorId, sessionId, hits } = req.body || {};
        if (!ID_RE.test(visitorId || '') || !ID_RE.test(sessionId || '') || !Array.isArray(hits) || hits.length === 0) {
            return res.status(400).json({ message: 'Invalid tracking payload' });
        }

        const now = Date.now();
        const ctx = { visitorId, sessionId, ip, now };
        for (const rawHit of hits.slice(0, MAX_HITS_PER_REQUEST)) {
            const hit = sanitizeHit(rawHit, ctx);
            if (hit) eventBuffer.enqueue(hit);
        }

        return res.status(202).json({ ok: true });
    } catch (err) {
        console.error('Error in analytics collect:', err);
        // A tracking failure must never surface as a broken request to the
        // page that triggered it.
        return res.status(202).json({ ok: false });
    }
};
