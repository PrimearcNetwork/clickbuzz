const { Op, fn, col, literal } = require('sequelize');
const { Visitor, Session, AnalyticsSummary, Payment, sequelize } = require('../../models');
const { parseDateRange, todayStr, addDaysStr } = require('../../utils/analytics/dateRange.util');
const { computeDailySummary } = require('../../services/analytics/rollup.service');

// Range bounds for raw SQL as plain UTC 'YYYY-MM-DD HH:MM:SS' strings.
// (A JS Date passed as a raw-query replacement gets formatted in the server's
// local timezone, which shifts the day window.)
function rawSqlRange(query) {
    const { from, to } = parseDateRange(query);
    return { from: `${from} 00:00:00`, to: `${addDaysStr(to, 1)} 00:00:00` };
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_DAY_COMPUTATIONS = 3;

// Bounded-concurrency map — runs `fn` over `items` with at most `limit` in
// flight at once, instead of Promise.all's unbounded "start everything
// immediately." See getTrend's comment for why this matters here: each
// `fn` call can borrow a DB connection for its duration.
async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            results[current] = await fn(items[current], current);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

// GET /api/analytics/dashboard/summary?from&to — the top-row stat cards.
exports.getSummary = async (req, res) => {
    try {
        const { fromDate, toDateExclusive, sequelizeRange } = parseDateRange(req.query);

        const [totalSessions, uniqueVisitors, newVisitors, conversions, bounces, durationResult] = await Promise.all([
            Session.count({ where: { started_at: sequelizeRange } }),
            Session.count({ where: { started_at: sequelizeRange }, distinct: true, col: 'visitor_id' }),
            Visitor.count({ where: { first_visit_at: sequelizeRange } }),
            Session.count({ where: { started_at: sequelizeRange, converted: true } }),
            Session.count({ where: { started_at: sequelizeRange, is_bounce: true } }),
            Session.findOne({
                attributes: [[fn('AVG', col('duration_seconds')), 'avgDuration']],
                where: { started_at: sequelizeRange },
                raw: true
            })
        ]);

        const returningVisitors = Math.max(0, uniqueVisitors - newVisitors);
        const bounceRate = totalSessions > 0 ? Number(((bounces / totalSessions) * 100).toFixed(2)) : 0;
        const avgSessionDuration = Math.round(Number(durationResult?.avgDuration) || 0);

        return res.json({
            range: { from: req.query.from || null, to: req.query.to || null, fromDate, toDateExclusive },
            totalVisitors: uniqueVisitors,
            uniqueVisitors,
            newVisitors,
            returningVisitors,
            sessions: totalSessions,
            avgSessionDuration,
            bounceRate,
            conversions
        });
    } catch (err) {
        console.error('Error fetching analytics summary:', err);
        return res.status(500).json({ message: 'Server error fetching analytics summary' });
    }
};

// GET /api/analytics/dashboard/active — visitors with activity in the last 5
// minutes. Deliberately separate from getSummary so a frequent poll (this
// card is the one meant to feel "live") never re-runs the heavier range
// aggregation above.
exports.getActiveVisitors = async (req, res) => {
    try {
        const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
        const activeVisitors = await Session.count({
            where: { updated_at: { [Op.gte]: since }, ended_at: null },
            distinct: true,
            col: 'visitor_id'
        });
        return res.json({ activeVisitors });
    } catch (err) {
        console.error('Error fetching active visitors:', err);
        return res.status(500).json({ message: 'Server error fetching active visitors' });
    }
};

// GET /api/analytics/dashboard/trend?from&to — one row per day, powers the
// "Visitors by Day/Week/Month" and "Conversion Trends" charts (the frontend
// re-buckets this same daily series into weeks/months rather than the
// backend maintaining three separate aggregations).
//
// Historical days are read from the analytics_daily_summary rollup table
// (see rollup.service.js); today is always computed live since it's still
// accumulating. A day with no rollup row yet (e.g. the feature is brand new
// and the nightly cron hasn't run) is computed on demand and persisted, so
// the next request for that same day is a fast lookup.
exports.getTrend = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        const today = todayStr();

        const dates = [];
        for (let d = from; d <= to; d = addDay(d)) {
            dates.push(d);
            if (dates.length > 400) break; // sane upper bound on range size
        }

        const existing = await AnalyticsSummary.findAll({
            where: { date: { [Op.in]: dates.filter((d) => d !== today) } },
            raw: true
        });
        const byDate = new Map(existing.map((row) => [row.date, row]));

        // computeDailySummary borrows a DB connection per date while it
        // runs (see rollup.service.js). Firing it via Promise.all across
        // the whole range — the original approach here — meant a 30/90-day
        // range on a fresh install (no rollup rows yet, so every date needs
        // on-demand computation) could try to hold 30-90 connections at
        // once, blowing straight through a cluster worker's pool share
        // (db.config.js's DB_POOL_MAX split across workers, ~7 by default
        // in a 4-worker dev cluster) and timing out — which starves
        // ordinary site traffic on that worker too, not just this request.
        // MAX_CONCURRENT_DAY_COMPUTATIONS keeps at most a few dates
        // in flight regardless of range size; already-rolled-up dates
        // (the common case once the nightly cron has run a few times)
        // skip this entirely and resolve instantly from `byDate`.
        const series = await mapWithConcurrency(dates, MAX_CONCURRENT_DAY_COMPUTATIONS, async (date) => {
            if (date !== today && byDate.has(date)) {
                return toTrendPoint(byDate.get(date));
            }
            const summary = await computeDailySummary(date);
            return toTrendPoint(summary.toJSON ? summary.toJSON() : summary);
        });

        return res.json({ from, to, series });
    } catch (err) {
        console.error('Error fetching analytics trend:', err);
        return res.status(500).json({ message: 'Server error fetching analytics trend' });
    }
};

function addDay(dateStr) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

function toTrendPoint(row) {
    return {
        date: row.date,
        totalVisitors: row.total_visitors,
        newVisitors: row.new_visitors,
        returningVisitors: row.returning_visitors,
        sessions: row.total_sessions,
        pageViews: row.total_page_views,
        avgSessionDuration: row.avg_session_duration_seconds,
        bounceRate: Number(row.bounce_rate),
        conversions: row.conversions
    };
}

// Dimension -> Session column config for the generic breakdown endpoint
// below. Mirrors this codebase's existing createMasterController factory
// pattern (backend/controllers/master.controller.js) — one flexible handler
// instead of ten near-identical ones for traffic source / device / browser /
// OS / country / region / city / UTM campaign / landing page / exit page / referrer.
const DIMENSIONS = {
    trafficSource: 'traffic_source',
    device: 'device_type',
    browser: 'browser',
    os: 'os',
    country: 'country',
    region: 'region',
    city: 'city',
    utmCampaign: 'utm_campaign',
    landingPage: 'entry_page',
    exitPage: 'exit_page',
    referrer: 'referrer_domain'
};

// GET /api/analytics/dashboard/breakdown?dimension=<key>&from&to&limit
exports.getBreakdown = async (req, res) => {
    try {
        const dimension = req.query.dimension;
        const column = DIMENSIONS[dimension];
        if (!column) {
            return res.status(400).json({ message: `Unknown dimension. Expected one of: ${Object.keys(DIMENSIONS).join(', ')}` });
        }

        const { sequelizeRange } = parseDateRange(req.query);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

        const rows = await Session.findAll({
            attributes: [column, [fn('COUNT', col('session_id')), 'count']],
            where: { started_at: sequelizeRange, [column]: { [Op.ne]: null, [Op.ne]: '' } },
            group: [column],
            order: [[literal('count'), 'DESC']],
            limit,
            raw: true
        });

        return res.json({
            dimension,
            data: rows.map((row) => ({ label: row[column], count: Number(row.count) }))
        });
    } catch (err) {
        console.error('Error fetching analytics breakdown:', err);
        return res.status(500).json({ message: 'Server error fetching analytics breakdown' });
    }
};

// GET /api/analytics/dashboard/utm-campaigns?from&to — campaign-level
// performance (source/medium/campaign combo), not just campaign name alone,
// since the same campaign name can run across multiple sources.
exports.getUtmCampaigns = async (req, res) => {
    try {
        const { sequelizeRange } = parseDateRange(req.query);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

        const rows = await Session.findAll({
            attributes: [
                'utm_source', 'utm_medium', 'utm_campaign',
                [fn('COUNT', col('session_id')), 'sessions'],
                [fn('SUM', literal('CASE WHEN converted THEN 1 ELSE 0 END')), 'conversions']
            ],
            where: { started_at: sequelizeRange, utm_campaign: { [Op.ne]: null } },
            group: ['utm_source', 'utm_medium', 'utm_campaign'],
            order: [[literal('sessions'), 'DESC']],
            limit,
            raw: true
        });

        // Content clicks and first-time checkouts made during each campaign's
        // sessions (payments link to their session via analytics_session_id).
        const replacements = rawSqlRange(req.query);
        const [clickRows, paymentRows] = await Promise.all([
            sequelize.query(
                `SELECT s.utm_source, s.utm_medium, s.utm_campaign, COUNT(*) AS clicks
                 FROM analytics_visitor_events e
                 JOIN analytics_sessions s ON s.session_id = e.session_id
                 WHERE e.event_name = 'content_click' AND s.utm_campaign IS NOT NULL
                   AND s.started_at >= :from AND s.started_at < :to
                 GROUP BY s.utm_source, s.utm_medium, s.utm_campaign`,
                { replacements, type: sequelize.QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT s.utm_source, s.utm_medium, s.utm_campaign,
                        COUNT(*) AS attempts,
                        SUM(CASE WHEN p.status = 'success' THEN 1 ELSE 0 END) AS successful
                 FROM payments p
                 JOIN analytics_sessions s ON s.session_id = p.analytics_session_id
                 WHERE p.payment_method = 'RAZORPAY' AND p.is_internal = false AND s.utm_campaign IS NOT NULL
                   AND s.started_at >= :from AND s.started_at < :to
                 GROUP BY s.utm_source, s.utm_medium, s.utm_campaign`,
                { replacements, type: sequelize.QueryTypes.SELECT }
            )
        ]);
        const keyOf = (row) => `${row.utm_source}|${row.utm_medium}|${row.utm_campaign}`;
        const clicksByKey = new Map(clickRows.map((row) => [keyOf(row), Number(row.clicks) || 0]));
        const paymentsByKey = new Map(paymentRows.map((row) => [keyOf(row), row]));

        return res.json({
            data: rows.map((row) => {
                const payments = paymentsByKey.get(keyOf(row));
                return {
                    source: row.utm_source,
                    medium: row.utm_medium,
                    campaign: row.utm_campaign,
                    sessions: Number(row.sessions),
                    conversions: Number(row.conversions),
                    contentClicks: clicksByKey.get(keyOf(row)) || 0,
                    paymentAttempts: Number(payments?.attempts) || 0,
                    successfulPayments: Number(payments?.successful) || 0
                };
            })
        });
    } catch (err) {
        console.error('Error fetching UTM campaign performance:', err);
        return res.status(500).json({ message: 'Server error fetching UTM campaign performance' });
    }
};

// Real payment numbers per day (UTC, same day boundaries as the rest of the
// dashboard) from the `payments` table. First-time checkouts
// (payment_method 'RAZORPAY') are the funnel's attempts/outcomes; automatic
// renewals ('RAZORPAY_AUTOPAY') are reported separately so they never count
// as a visitor "attempting" to pay.
exports.getPayments = async (req, res) => {
    try {
        const { sequelizeRange } = parseDateRange(req.query);

        const rows = await Payment.findAll({
            attributes: [
                [fn('DATE', col('created_at')), 'date'],
                'payment_method',
                'status',
                [fn('COUNT', col('id')), 'count'],
                [fn('SUM', col('amount')), 'amount']
            ],
            // Team/owner test checkouts (payments.is_internal) never count.
            where: { created_at: sequelizeRange, is_internal: false },
            group: [fn('DATE', col('created_at')), 'payment_method', 'status'],
            raw: true
        });

        const byDate = new Map();
        const dayFor = (date) => {
            if (!byDate.has(date)) {
                byDate.set(date, {
                    date,
                    paymentAttempts: 0,
                    successfulPayments: 0,
                    failedPayments: 0,
                    pendingPayments: 0,
                    cancelledPayments: 0,
                    revenue: 0,
                    renewals: 0,
                    renewalRevenue: 0
                });
            }
            return byDate.get(date);
        };

        for (const row of rows) {
            // DATE() comes back as a Date or a 'YYYY-MM-DD' string depending on the driver.
            const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
            const day = dayFor(date);
            const count = Number(row.count) || 0;
            const amount = Number(row.amount) || 0;

            if (row.payment_method === 'RAZORPAY_AUTOPAY') {
                if (row.status === 'success') {
                    day.renewals += count;
                    day.renewalRevenue += amount;
                }
                continue;
            }

            day.paymentAttempts += count;
            if (row.status === 'success') {
                day.successfulPayments += count;
                day.revenue += amount;
            } else if (row.status === 'failed') {
                day.failedPayments += count;
            } else if (row.status === 'cancelled') {
                day.cancelledPayments += count;
            } else {
                day.pendingPayments += count;
            }
        }

        const series = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

        // People (distinct phone numbers) rather than attempts, for the funnel.
        const [people] = await Payment.findAll({
            attributes: [
                [fn('COUNT', fn('DISTINCT', col('customer_phone'))), 'attemptedPeople'],
                [fn('COUNT', fn('DISTINCT', literal("CASE WHEN status = 'success' THEN customer_phone END"))), 'paidPeople']
            ],
            where: { created_at: sequelizeRange, is_internal: false, payment_method: 'RAZORPAY' },
            raw: true
        });

        return res.json({
            series,
            totals: {
                attemptedPeople: Number(people?.attemptedPeople) || 0,
                paidPeople: Number(people?.paidPeople) || 0
            }
        });
    } catch (err) {
        console.error('Error fetching payment analytics:', err);
        return res.status(500).json({ message: 'Server error fetching payment analytics' });
    }
};

// Real audience/engagement numbers per UTC day plus de-duplicated totals for
// the whole range:
//   loggedInUsers   visitors with a session that had a login session
//   utmVisits       sessions that arrived with any UTM parameter
//   contentClicks   'content_click' events (movie/player links, see
//                   src/analytics/contentClickTracking.js)
//   engagedVisitors visitors with at least one content click
exports.getEngagement = async (req, res) => {
    try {
        const replacements = rawSqlRange(req.query);
        const select = (sql) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
        const hasUtm = 'COALESCE(utm_source, utm_medium, utm_campaign) IS NOT NULL';

        const [sessionDays, clickDays, [sessionTotals], [clickTotals]] = await Promise.all([
            select(`SELECT DATE(started_at) AS date,
                           COUNT(*) AS visits,
                           SUM(CASE WHEN ${hasUtm} THEN 1 ELSE 0 END) AS utmVisits,
                           COUNT(DISTINCT CASE WHEN is_logged_in THEN visitor_id END) AS loggedInUsers
                    FROM analytics_sessions
                    WHERE started_at >= :from AND started_at < :to
                    GROUP BY DATE(started_at)`),
            select(`SELECT DATE(created_at) AS date,
                           COUNT(*) AS contentClicks,
                           COUNT(DISTINCT visitor_id) AS engagedVisitors
                    FROM analytics_visitor_events
                    WHERE event_name = 'content_click' AND created_at >= :from AND created_at < :to
                    GROUP BY DATE(created_at)`),
            select(`SELECT COUNT(DISTINCT CASE WHEN is_logged_in THEN visitor_id END) AS loggedInUsers
                    FROM analytics_sessions
                    WHERE started_at >= :from AND started_at < :to`),
            select(`SELECT COUNT(DISTINCT visitor_id) AS engagedVisitors
                    FROM analytics_visitor_events
                    WHERE event_name = 'content_click' AND created_at >= :from AND created_at < :to`)
        ]);

        const toDateStr = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
        const byDate = new Map();
        const dayFor = (date) => {
            if (!byDate.has(date)) {
                byDate.set(date, { date, loggedInUsers: 0, utmVisits: 0, nonUtmVisits: 0, contentClicks: 0, engagedVisitors: 0 });
            }
            return byDate.get(date);
        };
        for (const row of sessionDays) {
            const day = dayFor(toDateStr(row.date));
            day.loggedInUsers = Number(row.loggedInUsers) || 0;
            day.utmVisits = Number(row.utmVisits) || 0;
            day.nonUtmVisits = (Number(row.visits) || 0) - day.utmVisits;
        }
        for (const row of clickDays) {
            const day = dayFor(toDateStr(row.date));
            day.contentClicks = Number(row.contentClicks) || 0;
            day.engagedVisitors = Number(row.engagedVisitors) || 0;
        }

        return res.json({
            series: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
            totals: {
                loggedInUsers: Number(sessionTotals?.loggedInUsers) || 0,
                engagedVisitors: Number(clickTotals?.engagedVisitors) || 0
            }
        });
    } catch (err) {
        console.error('Error fetching engagement analytics:', err);
        return res.status(500).json({ message: 'Server error fetching engagement analytics' });
    }
};
