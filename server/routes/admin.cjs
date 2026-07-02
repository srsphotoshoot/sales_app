const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { safeReadJSON, saveAtomic, generateID } = require('../utils/helpers.cjs');
const { pushToHub } = require('../utils/hub.cjs');
const { globalLock } = require('../utils/shared.cjs');
const { checkAuth, isAdmin } = require('../middleware/auth.cjs');
const { uploadLogo } = require('../config/multer.cjs');
const { 
    KEYS_FILE, STAFF_FILE, BRANDING_FILE 
} = require('../config/paths.cjs');

// Helper to save keys
const saveKeys = (keys) => saveAtomic(KEYS_FILE, keys);

// Admin: Generate a new 6-digit key
router.post('/generate-key', checkAuth, isAdmin, async (req, res) => {
    const release = await globalLock.acquire();
    try {
        const key = Math.floor(100000 + Math.random() * 900000).toString();
        const keys = safeReadJSON(KEYS_FILE);
        
        const newKey = {
            key,
            createdAt: new Date().toISOString(),
            used: false,
            usedAt: null
        };
        
        keys.push(newKey);
        saveKeys(keys);
        
        console.log(`🔑 New key generated: ${key}`);
        res.json({ success: true, key });
    } finally {
        release();
    }
});

// Admin: Get all active (unused) keys
router.get('/active-keys', checkAuth, isAdmin, (req, res) => {
    const keys = safeReadJSON(KEYS_FILE);
    const activeKeys = keys.filter(k => !k.used);
    res.json(activeKeys);
});

// Admin: Staff Management
router.get('/staff', checkAuth, (req, res) => {
    res.json(safeReadJSON(STAFF_FILE));
});

router.post('/staff/add', checkAuth, isAdmin, async (req, res) => {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, message: 'Name and Code required' });

    const release = await globalLock.acquire();
    try {
        const staff = safeReadJSON(STAFF_FILE);
        if (staff.find(s => s.code === code)) {
            return res.status(400).json({ success: false, message: 'Code already in use' });
        }

        const newStaff = {
            id: generateID('STF'),
            name,
            code,
            isActive: true,
            createdAt: new Date().toISOString()
        };
        staff.push(newStaff);
        saveAtomic(STAFF_FILE, staff);
        pushToHub('sales_app_staff', { ...newStaff, _action: 'ADD' });
        
        res.json({ success: true });
    } catch (err) {
        console.error('[STAFF] Addition failed:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    } finally {
        release();
    }
});

router.post('/staff/toggle', checkAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    const release = await globalLock.acquire();
    try {
        const staff = safeReadJSON(STAFF_FILE);
        const idx = staff.findIndex(s => s.id === id);
        if (idx !== -1) {
            staff[idx].isActive = !staff[idx].isActive;
            saveAtomic(STAFF_FILE, staff);
            pushToHub('sales_app_staff', { ...staff[idx], _action: 'TOGGLE' });
            res.json({ success: true, isActive: staff[idx].isActive });
        } else {
            res.status(404).json({ success: false });
        }
    } finally {
        release();
    }
});

router.delete('/staff/:id', checkAuth, isAdmin, async (req, res) => {
    const release = await globalLock.acquire();
    try {
        let staff = safeReadJSON(STAFF_FILE);
        const memberToDelete = staff.find(s => s.id === req.params.id);
        
        staff = staff.filter(s => s.id !== req.params.id);
        saveAtomic(STAFF_FILE, staff);
        
        if (memberToDelete) {
            pushToHub('sales_app_staff', { ...memberToDelete, _action: 'DELETE', isActive: false });
        }
        res.json({ success: true });
    } finally {
        release();
    }
});

// Admin: Branding & Logo (public - needed for login screen and unauthenticated views)
router.get('/branding', (req, res) => {
    const branding = safeReadJSON(BRANDING_FILE);
    res.json({
        logoUrl: `/uploads/logo/logo.png?t=${Date.now()}`,
        logoPosition: branding.logoPosition || 'top-right'
    });
});

router.post('/branding/update', checkAuth, isAdmin, async (req, res) => {
    const { logoPosition } = req.body;
    const release = await globalLock.acquire();
    try {
        const branding = { logoPosition: logoPosition || 'top-right' };
        saveAtomic(BRANDING_FILE, branding);
        pushToHub('sales_app_branding', {
            logoUrl: `/uploads/logo/logo.png`,
            logoPosition: branding.logoPosition
        });
        res.json({ success: true });
    } finally {
        release();
    }
});

router.post('/logo/upload', checkAuth, isAdmin, uploadLogo.single('logo'), (req, res) => {
    console.log("📸 [LOGO] Upload Request Received. Saving...");
    if (!req.file) {
        console.error("❌ [LOGO] No file received in req.file");
        return res.status(400).json({ success: false, message: 'No file received' });
    }
    
    console.log("✅ [LOGO] File saved to:", req.file.path);
    const branding = safeReadJSON(BRANDING_FILE);
    pushToHub('sales_app_branding', {
        logoUrl: `/uploads/logo/logo.png`,
        logoPosition: branding.logoPosition || 'top-right'
    });
    res.json({ success: true, url: '/uploads/logo/logo.png' });
});

module.exports = router;
