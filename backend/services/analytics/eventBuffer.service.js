// In-process batched write buffer for the analytics tracking pipeline.
//
// Why not RabbitMQ (the pattern the reminder feature already uses, see
// queues/rabbitmq.js): that pipeline runs a handful of jobs a minute. This
// one is on the hot path of every single page load across the whole public
// site — making page views depend on a message broker being reachable would
// add a new failure mode to ordinary browsing, and pageview writes don't
// need cross-process durability the way a billing reminder does (losing a
// pageview on a hard crash is an acceptable tradeoff; losing a payment
// reminder is not). An in-memory buffer flushed on a timer is the simpler,
// lower-risk fit for high-frequency, best-effort analytics writes, and
// still satisfies "asynchronous" + "batch writes" from the spec.
//
// Each cluster worker (see server.js) has its own independent buffer/timer —
// that's fine here, unlike cache.util.js's cross-worker invalidation
// problem, because nothing needs to read another worker's buffer; every
// worker just eventually flushes its own hits to the shared DB.

const { Visitor, Session, PageView, VisitorEvent, sequelize } = require('../../models');
const { hashIp } = require('../../utils/analytics/ipHash.util');
const { lookupGeolocation } = require('../../utils/analytics/geolocation.util');
const { parseUserAgent } = require('../../utils/analytics/uaParser.util');
const { classifyTrafficSource, getDomain } = require('../../utils/analytics/trafficSource.util');

const FLUSH_INTERVAL_MS = parseInt(process.env.ANALYTICS_FLUSH_INTERVAL_MS, 10) || 3000;
const MAX_BUFFER_SIZE = parseInt(process.env.ANALYTICS_MAX_BUFFER_SIZE, 10) || 500;
const BOUNCE_MIN_DURATION_SECONDS = 10; // GA4-style "engaged session" heuristic

let queue = [];
let flushing = false;
let timer = null;

function enqueue(hit) {
    queue.push(hit);
    if (queue.length >= MAX_BUFFER_SIZE) {
        // Buffer filled up faster than the timer — flush immediately instead
        // of growing unbounded under a traffic burst.
        flush();
    }
}

function start() {
    if (timer) return;
    timer = setInterval(flush, FLUSH_INTERVAL_MS);
    // Don't hold the process open just for this timer during graceful shutdown.
    if (timer.unref) timer.unref();
}

async function flush() {
    if (flushing || queue.length === 0) return;
    flushing = true;

    const batch = queue;
    queue = [];

    try {
        const sessionStarts = batch.filter((h) => h.type === 'session_start');
        const pageviews = batch.filter((h) => h.type === 'pageview');
        const events = batch.filter((h) => h.type === 'event');
        const sessionEnds = batch.filter((h) => h.type === 'session_end');
        const heartbeats = batch.filter((h) => h.type === 'heartbeat');

        // Sessions must exist before pageviews/events reference them.
        await Promise.all(sessionStarts.map((hit) => processSessionStart(hit).catch((err) =>
            console.error('[analytics buffer] session_start failed:', err.message))));

        await processPageviews(pageviews).catch((err) =>
            console.error('[analytics buffer] pageviews failed:', err.message));

        await processEvents(events).catch((err) =>
            console.error('[analytics buffer] events failed:', err.message));

        await Promise.all(sessionEnds.map((hit) => processSessionEnd(hit).catch((err) =>
            console.error('[analytics buffer] session_end failed:', err.message))));

        await Promise.all(heartbeats.map((hit) => processHeartbeat(hit).catch((err) =>
            console.error('[analytics buffer] heartbeat failed:', err.message))));
    } catch (err) {
        console.error('[analytics buffer] flush failed (non-fatal):', err.message);
    } finally {
        flushing = false;
    }
}

async function processSessionStart(hit) {
    const ipHash = hashIp(hit.ip);
    const ua = parseUserAgent(hit.userAgent);
    const geo = await lookupGeolocation(hit.ip);
    const referrerDomain = getDomain(hit.referrerUrl);
    const trafficSource = classifyTrafficSource({
        referrerUrl: hit.referrerUrl,
        landingUrl: hit.landingUrl,
        utmSource: hit.utmSource,
        utmMedium: hit.utmMedium
    });
    const timestamp = new Date(hit.timestamp);
    const timezone = geo.timezone || hit.timezone || null;

    const deviceFields = {
        device_type: ua.deviceType,
        device_model: ua.deviceModel,
        browser: ua.browser,
        browser_version: ua.browserVersion,
        os: ua.os,
        os_version: ua.osVersion,
        screen_resolution: hit.screenResolution || null,
        language: hit.language || null
    };
    const geoFields = {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        timezone,
        latitude: geo.latitude,
        longitude: geo.longitude,
        isp: geo.isp
    };

    let visitor = await Visitor.findByPk(hit.visitorId);
    if (!visitor) {
        try {
            visitor = await Visitor.create({
                visitor_id: hit.visitorId,
                ip_hash: ipHash,
                first_visit_at: timestamp,
                last_visit_at: timestamp,
                total_visits: 1,
                total_sessions: 1,
                is_returning: false,
                ...deviceFields,
                ...geoFields,
                first_referrer_url: hit.referrerUrl || null,
                first_referrer_domain: referrerDomain,
                first_landing_page: hit.landingUrl || null,
                first_traffic_source: trafficSource,
                first_utm_source: hit.utmSource || null,
                first_utm_medium: hit.utmMedium || null,
                first_utm_campaign: hit.utmCampaign || null,
                first_utm_term: hit.utmTerm || null,
                first_utm_content: hit.utmContent || null
            });
        } catch (err) {
            // Race: another worker/request created this visitor between the
            // findByPk above and this create — fall through and treat as returning.
            visitor = await Visitor.findByPk(hit.visitorId);
            if (!visitor) throw err;
        }
    } else {
        await visitor.update({
            ip_hash: ipHash,
            last_visit_at: timestamp,
            total_visits: visitor.total_visits + 1,
            total_sessions: visitor.total_sessions + 1,
            is_returning: true,
            ...deviceFields,
            ...geoFields
        });
    }

    await Session.upsert({
        session_id: hit.sessionId,
        visitor_id: hit.visitorId,
        started_at: timestamp,
        entry_page: hit.landingUrl || null,
        exit_page: hit.landingUrl || null,
        pages_viewed: 0,
        is_bounce: true,
        converted: false,
        traffic_source: trafficSource,
        referrer_url: hit.referrerUrl || null,
        referrer_domain: referrerDomain,
        utm_source: hit.utmSource || null,
        utm_medium: hit.utmMedium || null,
        utm_campaign: hit.utmCampaign || null,
        utm_term: hit.utmTerm || null,
        utm_content: hit.utmContent || null,
        device_type: ua.deviceType,
        browser: ua.browser,
        os: ua.os,
        country: geo.country,
        region: geo.region,
        city: geo.city
    });
}

async function processPageviews(hits) {
    if (hits.length === 0) return;

    const bySession = new Map();
    for (const hit of hits) {
        if (!bySession.has(hit.sessionId)) bySession.set(hit.sessionId, []);
        bySession.get(hit.sessionId).push(hit);
    }

    await Promise.all(Array.from(bySession.entries()).map(async ([sessionId, sessionHits]) => {
        sessionHits.sort((a, b) => a.timestamp - b.timestamp);

        const session = await Session.findByPk(sessionId);
        if (!session) return; // session_start hit was lost/dropped — nothing to attach to

        let previousPageView = await PageView.findOne({
            where: { session_id: sessionId },
            order: [['entered_at', 'DESC']]
        });

        let pagesAdded = 0;
        for (const hit of sessionHits) {
            const enteredAt = new Date(hit.timestamp);

            if (previousPageView && previousPageView.time_on_page_seconds == null) {
                const seconds = Math.max(0, Math.round((enteredAt - previousPageView.entered_at) / 1000));
                await previousPageView.update({ time_on_page_seconds: seconds });
            }

            previousPageView = await PageView.create({
                session_id: sessionId,
                visitor_id: hit.visitorId,
                url: hit.url,
                page_title: hit.pageTitle || null,
                entered_at: enteredAt,
                is_entry_page: session.pages_viewed === 0 && pagesAdded === 0
            });
            pagesAdded += 1;
        }

        const totalPages = session.pages_viewed + pagesAdded;
        await session.update({
            pages_viewed: totalPages,
            exit_page: sessionHits[sessionHits.length - 1].url,
            is_bounce: totalPages < 2 && session.duration_seconds < BOUNCE_MIN_DURATION_SECONDS,
            // Only ever switches on: a session that logged in part-way stays logged in.
            is_logged_in: session.is_logged_in || sessionHits.some((hit) => hit.loggedIn)
        });
    }));
}

async function processEvents(hits) {
    if (hits.length === 0) return;

    await VisitorEvent.bulkCreate(hits.map((hit) => ({
        session_id: hit.sessionId,
        visitor_id: hit.visitorId,
        event_name: hit.eventName,
        event_category: hit.eventCategory || null,
        page_url: hit.pageUrl || null,
        metadata: hit.metadata ? JSON.stringify(hit.metadata) : null,
        is_conversion: Boolean(hit.isConversion),
        created_at: new Date(hit.timestamp)
    })));

    const conversionSessionIds = [...new Set(hits.filter((h) => h.isConversion).map((h) => h.sessionId))];
    if (conversionSessionIds.length > 0) {
        await Session.update({ converted: true }, { where: { session_id: conversionSessionIds } });
    }
}

async function processSessionEnd(hit) {
    const session = await Session.findByPk(hit.sessionId);
    if (!session) return;

    const endedAt = new Date(hit.timestamp);
    const durationSeconds = Math.max(
        session.duration_seconds,
        Math.round((endedAt - session.started_at) / 1000)
    );

    const lastPageView = await PageView.findOne({
        where: { session_id: hit.sessionId },
        order: [['entered_at', 'DESC']]
    });
    if (lastPageView && lastPageView.time_on_page_seconds == null) {
        const seconds = Math.max(0, Math.round((endedAt - lastPageView.entered_at) / 1000));
        await lastPageView.update({ time_on_page_seconds: seconds });
    }

    await session.update({
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        exit_page: hit.exitPage || session.exit_page,
        is_bounce: session.pages_viewed < 2 && durationSeconds < BOUNCE_MIN_DURATION_SECONDS
    });
}

async function processHeartbeat(hit) {
    // Lightweight — a direct UPDATE rather than find+save, since heartbeats
    // fire every ~15-20s per active tab and only need to keep duration/bounce
    // roughly current, not perfectly precise.
    const durationSeconds = Math.max(0, Math.round(hit.durationSeconds || 0));
    await sequelize.query(
        `UPDATE analytics_sessions
         SET duration_seconds = GREATEST(duration_seconds, :duration),
             is_bounce = CASE WHEN pages_viewed >= 2 OR :duration >= :bounceThreshold THEN false ELSE is_bounce END
         WHERE session_id = :sessionId`,
        {
            replacements: {
                duration: durationSeconds,
                bounceThreshold: BOUNCE_MIN_DURATION_SECONDS,
                sessionId: hit.sessionId
            }
        }
    );
}

module.exports = { enqueue, start, flush };
