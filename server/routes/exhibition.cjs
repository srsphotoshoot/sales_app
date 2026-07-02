const express = require('express');
const router = express.Router();
const { safeReadJSON, saveAtomic } = require('../utils/helpers.cjs');
const { globalLock } = require('../utils/shared.cjs');
const { checkAuth, isAdmin } = require('../middleware/auth.cjs');

// Staff or Admin only — blocks legacy Guest sessions (6-digit key users)
const isStaff = (req, res, next) => {
    if (req.user !== 'Staff' && req.user !== 'Admin') {
        return res.status(403).json({ success: false, message: 'Staff or Admin access required' });
    }
    next();
};
const { EXHIBITION_FILE } = require('../config/paths.cjs');

// GET all exhibition items
router.get('/', checkAuth, (req, res) => {
    res.json(safeReadJSON(EXHIBITION_FILE));
});

// POST — upsert by productCode (Staff/Admin only)
router.post('/', checkAuth, isStaff, async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ success: false, message: 'items must be an array' });

    const release = await globalLock.acquire();
    try {
        const existing = safeReadJSON(EXHIBITION_FILE);
        let added = 0, updated = 0;

        items.forEach(incoming => {
            const idx = existing.findIndex(e => e.productCode === incoming.productCode);
            if (idx !== -1) {
                existing[idx] = { ...existing[idx], ...incoming, timestamp: new Date().toISOString() };
                updated++;
            } else {
                existing.unshift({ ...incoming, timestamp: new Date().toISOString() });
                added++;
            }
        });

        if (saveAtomic(EXHIBITION_FILE, existing)) {
            res.json({ success: true, added, updated });
        } else {
            throw new Error('Write failed');
        }
    } finally {
        release();
    }
});

// DELETE — clear entire exhibition (Admin only — destructive)
router.delete('/', checkAuth, isAdmin, async (req, res) => {
    const release = await globalLock.acquire();
    try {
        if (saveAtomic(EXHIBITION_FILE, [])) {
            res.json({ success: true });
        } else {
            throw new Error('Write failed');
        }
    } finally {
        release();
    }
});

module.exports = router;
