const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const compression = require('compression');
const requestLogger = require('./middleware/requestLogger.middleware');
const { requireAdmin, requireAdminForWrites } = require('./middleware/adminSession.middleware');

const app = express();
// Don't advertise the framework in every response header.
app.disable('x-powered-by');

// Middleware
// level: 4 (default is ~6) — compression's own docs recommend 1-3 for
// "high-volume services" as a speed/ratio tradeoff; every response here
// gets gzipped regardless of whether it came from a fresh DB read or the
// cache (compression operates on outgoing bytes, not on cache.util.js's
// cached JSON), so this CPU cost is paid on every single request. A 3000-VU
// load test showed a hard throughput ceiling with clean, fast completions
// right up to it — level 4 trades a small amount of compression ratio for
// meaningfully less CPU per response under exactly that kind of sustained
// concurrency (paired with clustering and a larger libuv threadpool, see
// server.js).
app.use(compression({ level: 4 }));

// Restrict cross-origin requests to this app's own frontend(s) — previously
// wide open (bare cors()), which let any origin call this API directly from
// a browser. clickbuz.in/www.clickbuz.in are hardcoded (not read solely from
// FRONTEND_URL) since an unset/mismatched env var on Render previously took
// the entire production site down with CORS-blocked 500s the moment this
// restriction shipped — FRONTEND_URL is still included so it keeps working
// if the domain ever changes, but the real domain no longer depends on it
// being configured correctly. Localhost origins are also allowed so local
// frontend dev against this backend keeps working regardless of NODE_ENV.
const allowedOrigins = [
    'https://clickbuz.in',
    'https://www.clickbuz.in',
    (process.env.FRONTEND_URL || '').replace(/\/$/, ''),
    'http://localhost:5173',
    'http://127.0.0.1:5173'
].filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        // No Origin header (server-to-server calls, curl, Razorpay webhooks)
        // isn't a browser CORS request at all — always allow it through.
        // Unknown origin: answer without CORS headers so the browser blocks
        // it — not an Error, which would turn every such request into a 500
        // plus a stack trace in logs/error.log.
        return callback(null, !origin || allowedOrigins.includes(origin));
    },
    // Lets the /admin and /analytics dashboards send their httpOnly session
    // cookie (see middleware/adminSession.middleware.js). Only ever sent
    // back to the allow-listed origins above — never a wildcard.
    credentials: true
}));
// `verify` stashes the exact raw request bytes on req.rawBody, alongside the
// normal parsed req.body — needed by routes/payment.routes.js's webhook
// signature check, since Razorpay signs the literal bytes it sent and
// JSON.stringify(req.body) is not guaranteed to reproduce them byte-for-byte.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// Access logging goes to a file, not the console, regardless of NODE_ENV —
// under concurrent load, per-request console writes (morgan's default) can
// block the event loop (console/stdout writes are synchronous on Windows
// when stdout is a TTY, which is exactly the setup during local load
// testing) instead of the async I/O a file stream gives. A 1000-VU load
// test surfaced this as part of the p95/peak latency, alongside connection
// pool pressure (see db.config.js).
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// Failed/slow-request logging (separate from the access log above) — see
// requestLogger.middleware.js for why this is selective, not per-request.
app.use(requestLogger);

// All uploaded media is served directly from Bunny Storage's CDN (see
// backend/utils/bunnyStorage.util.js) — there is no local uploads folder to
// serve statically here anymore.

// Basic route for testing
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the Node.js API' });
});

// Import Routes
// Legacy email/password auth (register/login/logout/forgot-password) — real
// JWT-based; only AdminLogin.jsx calls it. Consumer-facing phone/OTP auth is
// demo-only now and lives entirely in the frontend (see src/hooks/useAuth.js).
app.use('/api/legacy-auth', require('./routes/auth.routes'));
app.use('/api/user', require('./routes/user.routes'));
// Admin/Analytics password gate (ADMIN_ACCESS_PASSWORD) — login/session/logout.
// CMS routers below keep their public GETs; every write needs the admin session.
app.use('/api/admin-auth', require('./routes/adminAuth.routes'));
app.use('/api/movies', requireAdminForWrites, require('./routes/movie.routes'));
app.use('/api/categories', requireAdminForWrites, require('./routes/category.routes'));
app.use('/api/subscription-plans', requireAdminForWrites, require('./routes/subscriptionPlan.routes'));
app.use('/api/settings-pages', requireAdminForWrites, require('./routes/settingsPage.routes'));
app.use('/api/settings-menu', requireAdminForWrites, require('./routes/settingsMenu.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/upload', requireAdminForWrites, require('./routes/upload.routes'));
app.use('/api/master', requireAdminForWrites, require('./routes/master.routes'));
app.use('/api/hero-banners', requireAdminForWrites, require('./routes/heroBanner.routes'));
app.use('/api/trays', requireAdminForWrites, require('./routes/tray.routes'));
app.use('/api/payments', require('./routes/payment.routes'));
app.use('/api/site-settings', requireAdminForWrites, require('./routes/siteSetting.routes'));

// Website Analytics System (see CLAUDE.md §23) — deliberately isolated from
// /api/admin: its own model files (models/analytics/), controllers
// (controllers/analytics/), and this one route mount. No auth middleware
// here, consistent with most other routes in this codebase (see CLAUDE.md
// §6/§17) — flagged, not assumed acceptable; add gating later if desired.
// The tracking beacon (POST /collect) stays public — every visitor sends it.
// Everything else here is the analytics dashboard and needs the admin session.
app.use('/api/analytics', (req, res, next) =>
    (req.method === 'POST' && req.path === '/collect') ? next() : requireAdmin(req, res, next),
    require('./routes/analytics.routes'));

// Global Error Handler — every controller already wraps its own try/catch
// and responds directly (see CLAUDE.md §13), so this is a backstop for
// anything that reaches here uncaught (e.g. a rejected promise Express 5
// auto-forwards from an async handler that didn't catch it itself), not the
// primary error path. Always returns valid JSON — no request should ever
// see a raw stack trace or an empty/broken response body.
app.use((err, req, res, next) => {
    requestLogger.errorLogStream.write(
        `${new Date().toISOString()} UNHANDLED ${req.method} ${req.originalUrl} ${err.stack}\n`
    );
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Process-level safety net: a rejected promise or thrown error outside the
// request/response cycle (e.g. inside a setTimeout callback, like the cache
// stampede fallback in cache.util.js) isn't caught by Express at all and
// would otherwise crash the whole process, taking down every in-flight
// request with it. This is a stateless, read-heavy API — logging and
// continuing is safer than exiting, since no in-memory transaction state
// needs to be protected by a hard crash-and-restart.
process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.stack : String(reason);
    requestLogger.errorLogStream.write(`${new Date().toISOString()} UNHANDLED_REJECTION ${message}\n`);
});
process.on('uncaughtException', (err) => {
    requestLogger.errorLogStream.write(`${new Date().toISOString()} UNCAUGHT_EXCEPTION ${err.stack}\n`);
});

module.exports = app;
