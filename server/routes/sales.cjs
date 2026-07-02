const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { safeReadJSON, saveAtomic, generateID } = require('../utils/helpers.cjs');
const { pushToHub, pushToCRM } = require('../utils/hub.cjs');
const { globalLock } = require('../utils/shared.cjs');
const { logInventoryAction } = require('../utils/logging.cjs');
const { checkAuth, isAdmin } = require('../middleware/auth.cjs');
const { SALES_FILE, PRODUCTS_FILE } = require('../config/paths.cjs');

router.post('/save-order', checkAuth, async (req, res) => {
    // Role-based access control for order creation
    if (!['Staff', 'Admin'].includes(req.user)) {
        return res.status(403).json({ success: false, message: 'Official staff access required to create orders.' });
    }

    const { customer, cart, createdBy } = req.body;
    if (!customer?.name || !cart?.length) return res.status(400).json({ success: false, message: 'Invalid order data' });
    if (typeof customer.name !== 'string' || customer.name.length > 200) return res.status(400).json({ success: false, message: 'Invalid customer name' });

    const release = await globalLock.acquire();
    try {
        const salesData = safeReadJSON(SALES_FILE);
        const productsData = safeReadJSON(PRODUCTS_FILE);

        // Validate: flag over-selling (qty > stock) for tracked products
        for (const item of cart) {
            if (item.type === 'interest') continue;
            const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
            if (!item.uid || item.uid.startsWith('EXHB-')) continue; // synthetic UIDs are fine
            const product = productsData.find(p => p.uid === item.uid);
            if (product && qty > product.pcs) {
                return res.status(400).json({ success: false, message: `Insufficient stock for "${product.name}" (${product.pcs} available, ${qty} requested)` });
            }
        }

        const newOrder = {
            orderId: generateID('ORD'),
            timestamp: new Date().toISOString(),
            customer,
            createdBy: createdBy || req.staffName || req.user || 'Unknown',
            cart: cart.map(item => ({
                ...item,
                qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
                rate: Math.max(0, Number(item.rate) || 0)
            })),
            totalItems: cart.reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item.qty) || 1)), 0),
            totalValue: cart.reduce((sum, item) => sum + (Math.max(0, Number(item.rate) || 0) * Math.max(1, Math.floor(Number(item.qty) || 1))), 0)
        };

        salesData.push(newOrder);

        cart.forEach(item => {
            if (item.type !== 'interest') {
                const pIdx = productsData.findIndex(p => p.uid === item.uid);
                if (pIdx !== -1) {
                    const prev = productsData[pIdx].pcs;
                    productsData[pIdx].pcs = Math.max(0, productsData[pIdx].pcs - (Number(item.qty) || 1));
                    logInventoryAction('SALE', {
                        uid: item.uid,
                        name: item.name,
                        prevQty: prev,
                        newQty: productsData[pIdx].pcs,
                        orderId: newOrder.orderId,
                        user: createdBy || 'User'
                    });
                }
            }
        });

        // Save order record FIRST — if product stock save fails we still have the order to reconcile
        if (!saveAtomic(SALES_FILE, salesData)) throw new Error('Sales Database Write Error');
        if (!saveAtomic(PRODUCTS_FILE, productsData)) throw new Error('Products Database Write Error');
        pushToHub('sales_app', newOrder);
        pushToCRM(newOrder);
        res.json({ success: true, orderId: newOrder.orderId });
    } finally {
        release();
    }
});

router.get('/history', checkAuth, (req, res) => {
    res.json(safeReadJSON(SALES_FILE));
});

// Customer autocomplete: search past orders for matching customer records
router.get('/customers/search', checkAuth, (req, res) => {
    const q = (req.query.q || '').toString().toLowerCase().trim();
    if (q.length < 2) return res.json([]);
    const sales = safeReadJSON(SALES_FILE);
    const seen = new Map();
    for (const order of sales) {
        const c = order.customer;
        if (!c || !c.name) continue;
        if (
            c.name.toLowerCase().includes(q) ||
            (c.contact || '').includes(q) ||
            (c.address || '').toLowerCase().includes(q)
        ) {
            if (!seen.has(c.name)) {
                seen.set(c.name, { name: c.name, contact: c.contact || '', address: c.address || '', gst: c.gst || '' });
            }
        }
    }
    res.json([...seen.values()].slice(0, 10));
});

// Admin: Delete an order
router.delete('/order/:orderId', checkAuth, isAdmin, async (req, res) => {
    const { orderId } = req.params;
    let sales = safeReadJSON(SALES_FILE);
    const orderToDelete = sales.find(s => s.orderId === orderId);
    
    sales = sales.filter(s => s.orderId !== orderId);
    if (saveAtomic(SALES_FILE, sales)) {
        if (orderToDelete) {
            const deletePayload = { ...orderToDelete, _action: 'DELETE' };
            pushToHub('sales_app', deletePayload);
            pushToCRM(deletePayload);
        }
        res.json({ success: true });
    } else {
        res.status(500).json({ success: false, message: 'Database Write Error' });
    }
});

module.exports = router;
