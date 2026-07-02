const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { safeReadJSON, saveAtomic } = require('../utils/helpers.cjs');
const { globalLock } = require('../utils/shared.cjs');
const { STAFF_FILE, SESSIONS_FILE, KEYS_FILE } = require('../config/paths.cjs');

// Brute-force protection for both PIN and staff code
const pinAttempts = new Map();    // ip -> { count, lockedUntil }
const staffAttempts = new Map();  // ip -> { count, lockedUntil }
const PIN_MAX_ATTEMPTS = 3;
const STAFF_MAX_ATTEMPTS = 10;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;   // 15 minutes
const STAFF_LOCKOUT_MS = 5 * 60 * 1000;  // 5 minutes

function checkRateLimit(map, ip, maxAttempts, lockoutMs) {
    const now = Date.now();
    const record = map.get(ip);
    if (record && record.lockedUntil && now < record.lockedUntil) {
        const remaining = Math.ceil((record.lockedUntil - now) / 1000);
        return { blocked: true, remaining };
    }
    return { blocked: false, record };
}

function recordFailedAttempt(map, ip, maxAttempts, lockoutMs) {
    const now = Date.now();
    const record = map.get(ip);
    const attempts = (record?.count || 0) + 1;
    if (attempts >= maxAttempts) {
        map.set(ip, { count: attempts, lockedUntil: now + lockoutMs });
    } else {
        map.set(ip, { count: attempts, lockedUntil: null });
    }
    return attempts;
}

// User: Verify Staff Permanent Code
router.post('/verify-staff', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const { blocked, remaining } = checkRateLimit(staffAttempts, ip, STAFF_MAX_ATTEMPTS, STAFF_LOCKOUT_MS);
    if (blocked) return res.status(429).json({ success: false, message: `Too many attempts. Try again in ${remaining}s.` });

    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Code is required' });

    const staff = safeReadJSON(STAFF_FILE);
    const member = staff.find(s => s.code === code);

    if (!member) {
        recordFailedAttempt(staffAttempts, ip, STAFF_MAX_ATTEMPTS, STAFF_LOCKOUT_MS);
        return res.status(401).json({ success: false, message: 'Invalid Staff Code' });
    }
    if (!member.isActive) return res.status(403).json({ success: false, message: 'Account Disabled' });

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const release = await globalLock.acquire();
    try {
        const sessions = safeReadJSON(SESSIONS_FILE);
        sessions.push({
            token: sessionToken,
            createdAt: Date.now(),
            user: 'Staff',
            staffName: member.name,
            staffCode: member.code
        });
        saveAtomic(SESSIONS_FILE, sessions);
    } finally {
        release();
    }

    res.json({ success: true, message: 'Login successful', sessionToken, name: member.name });
});

// Admin: Verify PIN (with brute-force protection)
router.post('/verify-pin', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    // Check if IP is locked out
    const record = pinAttempts.get(ip);
    if (record && record.lockedUntil && now < record.lockedUntil) {
        const remaining = Math.ceil((record.lockedUntil - now) / 1000);
        return res.status(429).json({ success: false, message: `Too many attempts. Try again in ${remaining}s.` });
    }

    const { pin } = req.body;
    const MASTER_PIN = process.env.ADMIN_MASTER_PIN;

    if (!MASTER_PIN) {
        return res.status(503).json({ success: false, message: 'Admin access not configured. Set ADMIN_MASTER_PIN in server environment.' });
    }

    if (pin === MASTER_PIN) {
        pinAttempts.delete(ip);
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const release2 = await globalLock.acquire();
        try {
            const sessions = safeReadJSON(SESSIONS_FILE);
            sessions.push({ token: sessionToken, createdAt: Date.now(), user: 'Admin' });
            saveAtomic(SESSIONS_FILE, sessions.slice(-500)); // cap at 500 sessions
        } finally {
            release2();
        }
        res.json({ success: true, sessionToken });
    } else {
        const attempts = recordFailedAttempt(pinAttempts, ip, PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MS);
        if (attempts >= PIN_MAX_ATTEMPTS) {
            return res.status(429).json({ success: false, message: `Too many failed attempts. Locked for 15 minutes.` });
        }
        res.status(401).json({ success: false, message: `Invalid PIN. ${PIN_MAX_ATTEMPTS - attempts} attempt(s) remaining.` });
    }
});

// Legacy: Verify 6-digit session key
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

            const sessionToken = crypto.randomBytes(32).toString('hex');
            const sessions = safeReadJSON(SESSIONS_FILE);
            sessions.push({ token: sessionToken, createdAt: Date.now(), user: 'Guest' });
            saveAtomic(SESSIONS_FILE, sessions);

            res.json({ success: true, sessionToken });
        } else {
            res.status(401).json({ success: false, message: 'Invalid or expired key' });
        }
    } finally {
        release();
    }
});

module.exports = router;
