const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { safeReadJSON, saveAtomic } = require('../utils/helpers.cjs');
const { globalLock } = require('../utils/shared.cjs');
const { KEYS_FILE, USERS_FILE } = require('../config/paths.cjs');

const LEGACY_LOGIN_ENABLED = process.env.ENABLE_LEGACY_PIN === 'true';

// Brute-force protection
const googleAttempts = new Map(); // ip -> { count, lockedUntil }
const pinAttempts = new Map();
const staffAttempts = new Map();
const GOOGLE_MAX_ATTEMPTS = 10;
const PIN_MAX_ATTEMPTS = 3;
const STAFF_MAX_ATTEMPTS = 10;
const GOOGLE_LOCKOUT_MS = 5 * 60 * 1000;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
const STAFF_LOCKOUT_MS = 5 * 60 * 1000;

function checkRateLimit(map, ip) {
    const now = Date.now();
    const record = map.get(ip);
    if (record && record.lockedUntil && now < record.lockedUntil) {
        return { blocked: true, remaining: Math.ceil((record.lockedUntil - now) / 1000) };
    }
    return { blocked: false };
}

function recordFailedAttempt(map, ip, maxAttempts, lockoutMs) {
    const now = Date.now();
    const record = map.get(ip);
    const attempts = (record?.count || 0) + 1;
    map.set(ip, { count: attempts, lockedUntil: attempts >= maxAttempts ? now + lockoutMs : null });
    return attempts;
}

// User: Google Sign-In. Frontend obtains a Google OAuth access_token (via
// Google Identity Services) and posts it here. Google itself vouches for the
// user's identity — our own users.json allowlist decides authorization.
router.post('/google', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const { blocked, remaining } = checkRateLimit(googleAttempts, ip);
    if (blocked) return res.status(429).json({ success: false, message: `Too many attempts. Try again in ${remaining}s.` });

    const { access_token, id_token } = req.body;
    if (!access_token && !id_token) return res.status(400).json({ success: false, message: 'id_token or access_token is required' });

    const JWT_SECRET = process.env.JWT_SECRET;
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!JWT_SECRET || !GOOGLE_CLIENT_ID) {
        return res.status(503).json({ success: false, message: 'Google login not configured on server.' });
    }

    try {
        // Native Android sign-in mints the access_token against the device's
        // Android-type OAuth client, so its aud never matches our web client ID —
        // only the ID token is guaranteed to carry our GOOGLE_CLIENT_ID as aud.
        const tokenParam = id_token
            ? `id_token=${encodeURIComponent(id_token)}`
            : `access_token=${encodeURIComponent(access_token)}`;
        const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?${tokenParam}`);
        if (!tokenInfoRes.ok) {
            recordFailedAttempt(googleAttempts, ip, GOOGLE_MAX_ATTEMPTS, GOOGLE_LOCKOUT_MS);
            return res.status(401).json({ success: false, message: 'Invalid Google token' });
        }
        const tokenInfo = await tokenInfoRes.json();

        // azp/aud identify which OAuth client this token was minted for — must be ours.
        if (tokenInfo.aud !== GOOGLE_CLIENT_ID && tokenInfo.azp !== GOOGLE_CLIENT_ID) {
            recordFailedAttempt(googleAttempts, ip, GOOGLE_MAX_ATTEMPTS, GOOGLE_LOCKOUT_MS);
            return res.status(401).json({ success: false, message: 'Token was not issued for this app' });
        }
        if (!tokenInfo.email || tokenInfo.email_verified !== 'true') {
            return res.status(401).json({ success: false, message: 'Google account email not verified' });
        }

        const email = tokenInfo.email.toLowerCase();
        const users = safeReadJSON(USERS_FILE);
        let account = users.find(u => (u.email || '').toLowerCase() === email);

        if (account && !account.isActive) {
            return res.status(403).json({ success: false, message: 'This Google account is not authorized. Ask Admin to add you.' });
        }

        // Any Google account not already on the allowlist gets auto-provisioned as
        // Staff — the Admin role is reserved for accounts explicitly added as Admin.
        if (!account) {
            account = {
                id: `STF-${Date.now()}`,
                name: tokenInfo.name || email,
                email,
                role: 'Staff',
                isActive: true,
                createdAt: new Date().toISOString()
            };
            users.push(account);
            saveAtomic(USERS_FILE, users);
        }

        const appToken = jwt.sign(
            { email, name: account.name, role: account.role },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ success: true, token: appToken, name: account.name, role: account.role });
    } catch (err) {
        console.error('[AUTH] Google login error:', err.message);
        res.status(500).json({ success: false, message: 'Google login failed — try again.' });
    }
});

// User: Guest one-time key — unrelated to staff/admin identity, kept enabled
// (e.g. showing the catalog to a customer without a real account).
router.post('/verify-key', async (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'Key is required' });

    const release = await globalLock.acquire();
    try {
        const keys = safeReadJSON(KEYS_FILE);
        const kIdx = keys.findIndex(k => k.key === key && !k.used);

        if (kIdx !== -1) {
            keys[kIdx].used = true;
            keys[kIdx].usedAt = new Date().toISOString();
            saveAtomic(KEYS_FILE, keys);

            const JWT_SECRET = process.env.JWT_SECRET;
            if (!JWT_SECRET) return res.status(503).json({ success: false, message: 'Auth not configured.' });
            const sessionToken = jwt.sign({ role: 'Guest', name: 'Guest' }, JWT_SECRET, { expiresIn: '8h' });
            res.json({ success: true, sessionToken });
        } else {
            res.status(401).json({ success: false, message: 'Invalid or expired key' });
        }
    } finally {
        release();
    }
});

// Legacy: shared staff code / shared admin PIN — superseded by /google above.
// Disabled by default; only a break-glass fallback during cutover.
if (LEGACY_LOGIN_ENABLED) {
    router.post('/verify-staff', async (req, res) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const { blocked, remaining } = checkRateLimit(staffAttempts, ip);
        if (blocked) return res.status(429).json({ success: false, message: `Too many attempts. Try again in ${remaining}s.` });

        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Code is required' });

        const staff = safeReadJSON(USERS_FILE);
        const member = staff.find(s => s.code === code);
        if (!member) {
            recordFailedAttempt(staffAttempts, ip, STAFF_MAX_ATTEMPTS, STAFF_LOCKOUT_MS);
            return res.status(401).json({ success: false, message: 'Invalid Staff Code' });
        }
        if (!member.isActive) return res.status(403).json({ success: false, message: 'Account Disabled' });

        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) return res.status(503).json({ success: false, message: 'Auth not configured.' });
        const sessionToken = jwt.sign({ role: 'Staff', name: member.name }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, message: 'Login successful', sessionToken, name: member.name });
    });

    router.post('/verify-pin', async (req, res) => {
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        const { blocked, remaining } = checkRateLimit(pinAttempts, ip);
        if (blocked) return res.status(429).json({ success: false, message: `Too many attempts. Try again in ${remaining}s.` });

        const { pin } = req.body;
        const MASTER_PIN = process.env.ADMIN_MASTER_PIN;
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!MASTER_PIN || !JWT_SECRET) return res.status(503).json({ success: false, message: 'Admin access not configured.' });

        if (pin === MASTER_PIN) {
            pinAttempts.delete(ip);
            const sessionToken = jwt.sign({ role: 'Admin', name: 'Admin' }, JWT_SECRET, { expiresIn: '8h' });
            res.json({ success: true, sessionToken });
        } else {
            const attempts = recordFailedAttempt(pinAttempts, ip, PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MS);
            if (attempts >= PIN_MAX_ATTEMPTS) {
                return res.status(429).json({ success: false, message: 'Too many failed attempts. Locked for 15 minutes.' });
            }
            res.status(401).json({ success: false, message: `Invalid PIN. ${PIN_MAX_ATTEMPTS - attempts} attempt(s) remaining.` });
        }
    });
} else {
    router.post(['/verify-staff', '/verify-pin'], (req, res) => {
        res.status(410).json({ success: false, message: 'This login method has been retired. Please sign in with Google.' });
    });
}

module.exports = router;
