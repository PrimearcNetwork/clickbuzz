require('./loadEnv');
const { Sequelize } = require('sequelize');

// Shared across both connection branches below — previously only the
// discrete DB_* branch had a pool config, so the DATABASE_URL branch (the one
// this project's .env actually uses, see CLAUDE.md §11) silently fell back to
// Sequelize's own default (max: 5). Under concurrent load that exhausts the
// pool almost immediately (requests queue for a free connection until the
// `acquire` timeout, then fail) — this was the primary cause of the high
// failure rate/latency seen under load testing on /api/movies/:id.
//
// Raised again (20 -> 30) after a 1000-VU heavy load test still showed pool
// pressure (p95 2.5s, peak 24.7s — close to the old 30s acquire timeout,
// consistent with requests queueing for a connection rather than the DB
// itself being slow). `acquire` lowered 30000 -> 10000: a request that can't
// get a connection within 10s should fail fast with a clean 500 instead of
// piling up for up to 30s and compounding queue depth for everyone behind
// it — combined with the caching/request-coalescing work (cache.util.js),
// most read traffic shouldn't reach the pool at all after warmup, so this
// pool is now sized for the residual cache-miss traffic, not 1:1 against
// concurrent users. Verify headroom with `SHOW VARIABLES LIKE
// 'max_connections'` on the MySQL server before raising `max` further.
//
// Configurable via DB_POOL_MAX because server.js now runs this backend as a
// Node `cluster` (one worker process per CPU core — see server.js for why:
// a 3000-VU test showed request throughput hard-plateau while every
// completed request stayed fast/clean, meaning a single process's capacity
// to accept/serve connections, not the database, was the ceiling). Each
// worker process gets its own independent connection pool, so with N
// workers the *effective total* pool size is N * max — server.js divides
// this same 30 budget across workers when forking so total DB pressure
// stays roughly where it was before clustering, since the database itself
// was never the bottleneck.
const poolMax = parseInt(process.env.DB_POOL_MAX, 10) || 30;
const pool = {
    max: poolMax,
    min: Math.min(5, poolMax), // stay valid even if a worker's share of the budget drops below 5
    acquire: 10000,
    idle: 10000
};

// Slow-query visibility without the cost of logging every query: Sequelize
// calls this with (sql, timingMs) when `benchmark: true`, so only queries
// that actually cross the threshold get logged — a blanket `logging:
// console.log` would itself add per-query overhead at high concurrency
// (the load test's own "excessive console logging" note applies here too).
const SLOW_QUERY_THRESHOLD_MS = 200;
const logSlowQueries = (sql, timingMs) => {
    if (timingMs > SLOW_QUERY_THRESHOLD_MS) {
        console.warn(`[slow query ${timingMs}ms] ${sql}`);
    }
};

const commonOptions = {
    dialect: 'mysql',
    logging: logSlowQueries,
    benchmark: true,
    pool
};

const sequelize = process.env.DATABASE_URL
    ? new Sequelize(process.env.DATABASE_URL, {
        ...commonOptions,
        dialectOptions: process.env.DB_SSL === 'true' ? {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        } : {}
    })
    : new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            ...commonOptions,
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            dialectOptions: process.env.DB_SSL === 'true' ? {
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            } : {}
        }
    );

module.exports = { sequelize };
