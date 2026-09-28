const adminSession = require('../middleware/adminSession.middleware');

// POST /api/admin-auth/login  { password }
exports.login = async (req, res) => {
    try {
        if (!adminSession.getPassword()) {
            return res.status(503).json({ message: 'Admin access is not configured' });
        }
        if (!adminSession.passwordMatches(req.body?.password)) {
            return res.status(401).json({ message: 'Incorrect password' });
        }
        res.cookie(adminSession.COOKIE_NAME, adminSession.issueToken(), {
            ...adminSession.cookieOptions(),
            maxAge: adminSession.sessionTtlHours() * 60 * 60 * 1000,
        });
        return res.json({ authenticated: true });
    } catch (err) {
        console.error('Admin login failed:', err.message);
        return res.status(500).json({ message: 'Admin login failed' });
    }
};

// GET /api/admin-auth/session
exports.session = (req, res) => {
    if (adminSession.hasValidSession(req)) {
        return res.json({ authenticated: true });
    }
    return res.status(401).json({ authenticated: false });
};

// POST /api/admin-auth/logout
exports.logout = (req, res) => {
    res.clearCookie(adminSession.COOKIE_NAME, adminSession.cookieOptions());
    return res.json({ authenticated: false });
};
