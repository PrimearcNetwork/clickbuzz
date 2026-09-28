// Must be set before anything that could touch libuv's threadpool is
// required (zlib/compression, crypto, fs, dns) — libuv reads this env var
// lazily on first threadpool use, not at process start, so setting it here
// as the very first statement works. Default is 4 regardless of CPU count;
// this backend gzip-compresses every response (see app.js's compression()
// middleware), and a 3000-VU load test showed request throughput hard-
// plateau while every request that did complete stayed fast and clean
// (backend/logs/access.log was ~100% 200s) — the ceiling was the process's
// ability to service concurrent work, not the database. A bigger threadpool
// gives compression (and any other libuv-threadpool work) more room before
// queueing.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';

const cluster = require('cluster');
const os = require('os');

// Round-robin is the default connection-distribution policy on every
// platform except Windows, which defaults to SCHED_NONE (leaves it to the
// OS) — verified against Node's own cluster docs. On this dev machine that
// left 3 of 4 workers completely idle under a test burst (only the primary-
// adjacent worker's CPU moved at all), which would have silently defeated
// the entire point of clustering. Must be set before the first `fork()` —
// it's frozen after that.
cluster.schedulingPolicy = cluster.SCHED_RR;

// Picks backend/.env (production, NODE_ENV=production via PM2) or
// backend/.env.development (local) — see config/loadEnv.js.
require('./config/loadEnv');

const PORT = process.env.PORT || 5000;
// Optional bind address. Production (VPS) sets BIND_HOST=127.0.0.1 so Node is
// only reachable through Nginx; unset keeps Node's default (all interfaces).
// Deliberately not named HOST — some shells (zsh) export HOST=<hostname>.
const HOST = process.env.BIND_HOST || undefined;

// How the primary reconciles models with the live schema on boot:
//   alter — sequelize.sync({ alter: true }): rewrites every table to match the
//           models. Development default.
//   safe  — sequelize.sync(): only creates tables that don't exist yet, never
//           alters existing ones. Production default.
//   none  — no sync at all; schema is managed purely by `npm run migrate`.
// Why production must not use alter: on MySQL, every alter pass re-issues each
// unique column with an inline UNIQUE, which adds another auto-named duplicate
// index (txnid_2, txnid_3, ...) on every single boot — MySQL's 64-keys-per-
// table limit then stops the backend from starting at all (already happened
// once on users.email). Production schema changes go through migrations.
const DB_SYNC_MODE = (process.env.DB_SYNC_MODE
    || (process.env.NODE_ENV === 'production' ? 'safe' : 'alter')).toLowerCase();

// Node's cluster module: fork one worker process per CPU core so this
// backend can actually use all of them — a single Node process only ever
// runs JS on one core no matter how many are available (confirmed 4 cores
// present, 1 process running, during the load test that plateaued). Workers
// share the listen port; the OS/cluster module load-balances incoming
// connections across them, which directly raises the connection-accept/
// request-processing ceiling that was the real bottleneck at 3000 VUs.
//
// WEB_CONCURRENCY (Heroku/Render's own convention) overrides the CPU-count
// default — useful to cap worker count explicitly on a host with more cores
// than makes sense to fork, or to force single-process mode (set to 1) for
// local debugging where per-worker stdout interleaving is confusing.
const numWorkers = parseInt(process.env.WEB_CONCURRENCY, 10) || os.cpus().length;

// DB pool budget is shared across however many workers actually serve
// traffic — see db.config.js's DB_POOL_MAX comment for why (the database
// itself was never the bottleneck here; this just keeps total connection
// pressure roughly where it was before clustering).
const TOTAL_DB_POOL_BUDGET = 30;
const perWorkerPoolMax = Math.max(5, Math.floor(TOTAL_DB_POOL_BUDGET / numWorkers));

// Production config sanity check — warnings only (never prints a value), so a
// misconfigured VPS .env shows up in `pm2 logs` at boot instead of silently
// sending test-mode payments/conversions.
function warnOnProductionConfig() {
    if (process.env.NODE_ENV !== 'production') return;
    const warn = (msg) => console.warn(`[config] WARNING: ${msg}`);
    const required = ['JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'ANALYTICS_IP_HASH_SALT', 'RABBITMQ_URL', 'ADMIN_ACCESS_PASSWORD'];
    for (const name of required) {
        if (!process.env[name]) warn(`${name} is not set`);
    }
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) warn('neither DATABASE_URL nor DB_HOST is set');
    if ((process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')) warn('RAZORPAY_KEY_ID is a TEST-mode key');
    if (process.env.META_CAPI_TEST_EVENT_CODE) warn('META_CAPI_TEST_EVENT_CODE is set — Conversions API events go to Meta test mode, not real reporting');
    if (process.env.DB_SSL === 'true') warn('DB_SSL=true, but the VPS MySQL is not configured for TLS');
    if (/^amqp:\/\/(guest:guest@)?(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.RABBITMQ_URL || '')) {
        warn('RABBITMQ_URL has no dedicated user/vhost (uses the default guest account)');
    }
    if (!process.env.BIND_HOST) warn('BIND_HOST is not set — Node listens on all interfaces; set BIND_HOST=127.0.0.1 behind Nginx');
}

if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} starting ${numWorkers} worker(s)... (env file: ${process.env.LOADED_ENV_FILE})`);
    warnOnProductionConfig();

    // The primary never serves HTTP (see the isPrimary/else split below) —
    // it only does the one-time sync/seed below and, afterwards, the
    // analytics rollup cron's nightly query (see the comment further down on
    // why its connection now stays open). Without an explicit DB_POOL_MAX here,
    // db.config.js's own default (30 — the same number the *entire* worker
    // fleet's budget is supposed to sum to, see TOTAL_DB_POOL_BUDGET above)
    // would apply to the primary's pool too, silently making the real
    // worst-case connection ceiling (workers' budget + primary's own
    // default) larger than documented/intended. The primary genuinely only
    // ever needs a couple of connections at a time, so give it a small,
    // explicit share instead of an unused 30-connection allowance.
    process.env.DB_POOL_MAX = String(Math.max(2, Math.floor(TOTAL_DB_POOL_BUDGET / 10)));

    // DB sync/seed must happen exactly once, not once per worker — running
    // sequelize.sync({ alter: true }) and the seed-if-empty checks
    // concurrently from multiple processes risks duplicate seed rows (a
    // classic check-then-act race: several workers could all see count===0
    // before any of them finishes inserting). The primary does this alone,
    // then forks workers only once it's done; workers connect to an
    // already-synced, already-seeded DB.
    const { sequelize } = require('./config/db.config');
    const { Genre, Language, AgeCertificate, MatureTheme, Badge, Vendor } = require('./models');

    const seedMasterData = async () => {
        const genreCount = await Genre.count();
        if (genreCount === 0) {
            await Genre.bulkCreate([
                { name: 'Action', sort_order: 1 },
                { name: 'Comedy', sort_order: 2 },
                { name: 'Drama', sort_order: 3 },
                { name: 'Romantic', sort_order: 4 },
            ]);
        }

        const langCount = await Language.count();
        if (langCount === 0) {
            await Language.bulkCreate([
                { name: 'English', code: 'Eng', sort_order: 1 },
                { name: 'Hindi', code: 'Hi', sort_order: 2 },
                { name: 'Marathi', code: 'Mar', sort_order: 3 },
            ]);
        }

        const ageCount = await AgeCertificate.count();
        if (ageCount === 0) {
            await AgeCertificate.bulkCreate([
                { name: 'U', description: 'Universal - suitable for all ages', sort_order: 1 },
                { name: 'U/A 13+', description: 'Parental guidance for children under 13', sort_order: 2 },
                { name: 'A', description: 'Adults only (18+)', sort_order: 3 },
            ]);
        }

        const themeCount = await MatureTheme.count();
        if (themeCount === 0) {
            await MatureTheme.bulkCreate([
                { name: 'None', sort_order: 1 },
                { name: 'Violence', sort_order: 2 },
                { name: 'Sexual', sort_order: 3 },
            ]);
        }

        const badgeCount = await Badge.count();
        if (badgeCount === 0) {
            await Badge.bulkCreate([
                { name: 'Hot', bg_color: '#670005', text_color: '#FFFFFF', border_gradient: 'linear-gradient(to bottom, #111111, #FFFFFF)', sort_order: 1 },
                { name: 'New', bg_color: '#014207', text_color: '#FFFFFF', border_gradient: 'linear-gradient(to bottom, #111111, #FFFFFF)', sort_order: 2 },
                { name: 'Original', bg_color: '#292929', text_color: '#FFFFFF', border_gradient: 'linear-gradient(to bottom, #111111, #FFFFFF)', sort_order: 3 },
            ]);
        }

        const vendorCount = await Vendor.count();
        if (vendorCount === 0) {
            await Vendor.bulkCreate([
                { name: 'Vendor A' },
                { name: 'Vendor B' },
                { name: 'Vendor C' },
            ]);
        }
    };

    sequelize.authenticate()
        .then(async () => {
            // Host/port/database only (never credentials) — lets deploy logs
            // confirm which MySQL instance this process actually reached.
            const { host, port, database } = sequelize.config;
            console.log(`Database connection has been established successfully (${host}:${port}/${database}).`);

            if (DB_SYNC_MODE === 'alter') {
                await sequelize.sync({ alter: true });
            } else if (DB_SYNC_MODE === 'safe') {
                await sequelize.sync();
            } else if (DB_SYNC_MODE !== 'none') {
                throw new Error(`Invalid DB_SYNC_MODE "${DB_SYNC_MODE}" (expected alter, safe or none)`);
            }
            console.log(`Database synchronized (DB_SYNC_MODE=${DB_SYNC_MODE}).`);

            await seedMasterData();
            console.log('Master data seeded.');

            // Reminder pipeline (RabbitMQ + cron, see backend/jobs|queues|
            // workers|services) — an isolated feature, started once here in
            // the primary process only. Starting it per-worker would fire
            // the cron N times and double-process queue jobs; the primary
            // never serves HTTP, so running it here doesn't compete with API
            // traffic either. Not awaited: RabbitMQ may be slow/unreachable
            // at boot, and this must never delay workers from starting to
            // serve requests. Failures here are logged and otherwise
            // harmless to the rest of the app (see queues/rabbitmq.js's
            // reconnect handling and the try/catch below).
            try {
                const reminderService = require('./services/reminder.service');
                const { startReminderCron } = require('./jobs/reminder.cron');
                const { startReminderWorker } = require('./workers/reminder.worker');

                reminderService.createTestSubscription();
                startReminderCron();
                startReminderWorker().catch((err) => {
                    console.error('[reminder] worker failed to start (non-fatal):', err.message);
                });
            } catch (err) {
                console.error('[reminder] failed to start reminder pipeline (non-fatal):', err.message);
            }

            // Analytics nightly rollup (see CLAUDE.md §23) — same reasoning
            // as the reminder cron above: must run exactly once, not once
            // per worker, so it lives in the primary only. The per-request
            // ingestion buffer itself (services/analytics/eventBuffer.service.js)
            // is started per-worker instead, right below in the worker branch —
            // each worker handles its own tracking requests and needs its own
            // flush timer.
            try {
                const { startAnalyticsRollupCron } = require('./jobs/analyticsRollup.cron');
                startAnalyticsRollupCron();
            } catch (err) {
                console.error('[analytics] failed to start rollup cron (non-fatal):', err.message);
            }

            // The primary itself never serves HTTP traffic, but — unlike the
            // in-memory reminder pipeline — the analytics rollup cron above
            // runs a real DB query from this same primary process once a
            // night for the lifetime of the process, so its Sequelize
            // connection can no longer be closed here. (Previously this
            // closed unconditionally, since nothing in the primary touched
            // the DB after boot — that's no longer true.) Recurring payment
            // billing itself no longer runs any cron of its own — Razorpay's
            // own Subscriptions product schedules and executes recurring
            // charges, delivered back to this app only via the
            // /api/payments/webhook route each worker already serves.

            const workers = new Set();
            const forkWorker = () => {
                const worker = cluster.fork({ DB_POOL_MAX: String(perWorkerPoolMax) });
                workers.add(worker);
                // Cross-worker cache-invalidation relay (see cache.util.js)
                // — a worker can't message a sibling directly, so it sends
                // here and the primary fans it out to every other worker.
                worker.on('message', (msg) => {
                    if (msg && msg.type === 'cache-invalidate') {
                        for (const w of workers) {
                            if (w !== worker && w.isConnected()) {
                                w.send(msg);
                            }
                        }
                    }
                });
            };

            for (let i = 0; i < numWorkers; i++) {
                forkWorker();
            }

            let shuttingDown = false;
            cluster.on('exit', (worker, code, signal) => {
                workers.delete(worker);
                if (!shuttingDown && !worker.exitedAfterDisconnect) {
                    console.error(`Worker ${worker.process.pid} died (code=${code} signal=${signal}) — restarting it.`);
                    forkWorker();
                }
            });

            // Without this, killing the primary (e.g. nodemon restarting on
            // a file change during development) leaves forked workers
            // running as orphans — they'd keep holding DB connections and
            // the listen port instead of exiting with their parent.
            const shutdown = () => {
                shuttingDown = true;
                for (const worker of workers) {
                    worker.kill();
                }
                process.exit(0);
            };
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
        })
        .catch(err => {
            console.error('Unable to connect to the database:', err);
            process.exit(1);
        });
} else {
    // Worker process: just serve HTTP. No sync/seed here — the primary
    // already did that before any worker was forked.
    const app = require('./app');

    // Each worker gets its own in-memory analytics buffer/flush timer (see
    // services/analytics/eventBuffer.service.js) — unlike cache.util.js's
    // cache, nothing needs cross-worker coordination here, since every
    // worker just eventually flushes its own received hits to the shared DB.
    require('./services/analytics/eventBuffer.service').start();

    app.listen(PORT, HOST, () => {
        console.log(`Worker ${process.pid} listening on ${HOST || '*'}:${PORT}`);
    });
}
