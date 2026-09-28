const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Server-side session for the /admin and /analytics dashboards.
//
// The password lives only in ADMIN_ACCESS_PASSWORD (backend .env). A correct
// password (POST /api/admin-auth/login) gets an httpOnly cookie holding a
// signed token; every admin/analytics API call is checked here.
//
// The signing key is derived from ADMIN_ACCESS_PASSWORD itself, so changing
// the password instantly invalidates every existing session, and the gate
// never depends on JWT_SECRET (a placeholder that was committed to git
// history — tokens signed with it could be forged).

const COOKIE_NAME = 'cb_admin_session';
const TOKEN_SCOPE = 'admin-panel';

const getPassword = () => process.env.ADMIN_ACCESS_PASSWORD || '';

const sessionTtlHours = () => {
    const hours = Number(process.env.ADMIN_SESSION_TTL_HOURS);
    return Number.isFinite(hours) && hours > 0 ? hours : 12;
};

const signingKey = () =>
    crypto.createHmac('sha256', getPassword()).update('clickbuz-admin-session-v1').digest();

// Constant-time comparison that is also safe for different lengths.
const passwordMatches = (candidate) => {
    const expected = getPassword();
    if (!expected || typeof candidate !== 'string') return false;
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
};

const issueToken = () =>
    jwt.sign({ scope: TOKEN_SCOPE }, signingKey(), { expiresIn: `${sessionTtlHours()}h` });

const readCookie = (req, name) => {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        if (part.slice(0, idx).trim() === name) {
            try {
                return decodeURIComponent(part.slice(idx + 1).trim());
            } catch {
                return null;
            }
        }
    }
    return null;
};

const hasValidSession = (req) => {
    if (!getPassword()) return false; // not configured -> fail closed
    const token = readCookie(req, COOKIE_NAME);
    if (!token) return false;
    try {
        const payload = jwt.verify(token, signingKey());
        return payload.scope === TOKEN_SCOPE;
    } catch {
        return false;
    }
};

const cookieOptions = () => ({
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
});

const requireAdmin = (req, res, next) => {
    if (hasValidSession(req)) return next();
    return res.status(401).json({ message: 'Admin authentication required' });
};

// Public reads stay public (the consumer site needs them); only writes are gated.
const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const requireAdminForWrites = (req, res, next) =>
    READ_METHODS.includes(req.method) ? next() : requireAdmin(req, res, next);

module.exports = {
    COOKIE_NAME,
    getPassword,
    sessionTtlHours,
    passwordMatches,
    issueToken,
    hasValidSession,
    cookieOptions,
    requireAdmin,
    requireAdminForWrites,
};
