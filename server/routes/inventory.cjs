const express = require('express');
const router = express.Router();
const { safeReadJSON, saveAtomic } = require('../utils/helpers.cjs');
const { pushToHub } = require('../utils/hub.cjs');
const { globalLock } = require('../utils/shared.cjs');
const { logInventoryAction } = require('../utils/logging.cjs');
const { checkAuth, isAdmin } = require('../middleware/auth.cjs');
const { PRODUCTS_FILE, LOGS_FILE } = require('../config/paths.cjs');

// Admin: Bulk Upload (Excel JSON)
router.post('/bulk-upload', checkAuth, isAdmin, async (req, res) => {
    const { products: bulkProducts } = req.body;
    if (!Array.isArray(bulkProducts)) return res.status(400).json({ success: false, message: 'Invalid products array' });

    const release = await globalLock.acquire();
    try {
        const localProducts = safeReadJSON(PRODUCTS_FILE);
        let added = 0;
        let updated = 0;

        bulkProducts.forEach(newP => {
            const idx = localProducts.findIndex(p => p.uid === newP.uid);
            if (idx !== -1) {
                localProducts[idx] = { ...localProducts[idx], ...newP, timestamp: new Date().toISOString() };
                updated++;
            } else {
                localProducts.unshift({ ...newP, timestamp: new Date().toISOString() });
                added++;
            }
        });

        if (saveAtomic(PRODUCTS_FILE, localProducts)) {
            logInventoryAction('BULK', { count: bulkProducts.length, user: 'Admin' });
            // Push all to hub? Maybe too heavy. Only push added/updated?
            bulkProducts.forEach(p => pushToHub('sales_app_products', p));
            res.json({ success: true, added, updated });
        } else {
            throw new Error('Database Write Error');
        }
    } finally {
        release();
    }
});

// Admin: Inventory Logs
router.get('/logs', checkAuth, (req, res) => {
    res.json(safeReadJSON(LOGS_FILE));
});

module.exports = router;
