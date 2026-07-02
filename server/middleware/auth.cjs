const { safeReadJSON, saveAtomic } = require('../utils/helpers.cjs');
const { SESSIONS_FILE, STAFF_FILE } = require('../config/paths.cjs');

const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 hours
const REFRESH_THRESHOLD = 60 * 60 * 1000; // refresh if session age > 1 hour (sliding window)

const checkAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Authorization required' });

    const token = authHeader.replace('Bearer ', '');
    const sessions = safeReadJSON(SESSIONS_FILE);
    const now = Date.now();

    // Purge expired sessions and find current one in one pass
    const validSessions = sessions.filter(s => now - (s.createdAt || 0) < SESSION_TTL);
    const session = validSessions.find(s => s.token === token);

    if (!session) return res.status(401).json({ success: false, message: 'Invalid or expired session' });

    // Check staff status if it's a staff session
    if (session.user === 'Staff') {
        const staff = safeReadJSON(STAFF_FILE);
        const member = staff.find(s => s.code === session.staffCode);
        if (!member || !member.isActive) return res.status(401).json({ success: false, message: 'Access revoked' });
    }

    // Sliding TTL: extend session on activity + persist any purged sessions in one write
    const needsRefresh = now - session.createdAt > REFRESH_THRESHOLD;
    const hadExpired = validSessions.length !== sessions.length;
    if (needsRefresh || hadExpired) {
        if (needsRefresh) session.createdAt = now;
        saveAtomic(SESSIONS_FILE, validSessions);
    }

    req.user = session.user;
    req.staffName = session.staffName || null;
    next();
};

const isAdmin = (req, res, next) => {
    if (req.user !== 'Admin') {
        return res.status(403).json({ success: false, message: 'Administrative access required' });
    }
    next();
};

module.exports = { checkAuth, isAdmin };
