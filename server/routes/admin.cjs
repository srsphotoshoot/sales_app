const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { safeReadJSON, saveAtomic, generateID } = require('../utils/helpers.cjs');
const { pushToHub } = require('../utils/hub.cjs');
const { globalLock } = require('../utils/shared.cjs');
const { checkAuth, isAdmin } = require('../middleware/auth.cjs');
const { uploadLogo } = require('../config/multer.cjs');
const { shareDriveFolder } = require('../config/googleDrive.cjs');
const {
    KEYS_FILE, USERS_FILE, BRANDING_FILE
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

// Admin: User Management (Google-account based — replaces the old staff-code system)
router.get('/users', checkAuth, (req, res) => {
    res.json(safeReadJSON(USERS_FILE));
});

router.post('/users/add', checkAuth, isAdmin, async (req, res) => {
    const { name, email, role } = req.body;
    if (!name || !email || !['Admin', 'Staff'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Name, email and a valid role (Admin/Staff) are required' });
    }
    const cleanEmail = String(email).trim().toLowerCase();

    const release = await globalLock.acquire();
    try {
        const users = safeReadJSON(USERS_FILE);
        if (users.find(u => (u.email || '').toLowerCase() === cleanEmail)) {
            return res.status(400).json({ success: false, message: 'This email is already registered' });
        }

        const newUser = {
            id: generateID('USR'),
            name,
            email: cleanEmail,
            role,
            isActive: true,
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        saveAtomic(USERS_FILE, users);
        pushToHub('sales_app_users', { ...newUser, _action: 'ADD' });

        // Share the catalog images folder with them so their own Drive can serve
        // product images directly — best-effort, don't fail the whole request if it errors.
        let driveShared = false;
        try {
            await shareDriveFolder(cleanEmail);
            driveShared = true;
        } catch (driveErr) {
            console.error('[USERS] Drive share failed for', cleanEmail, ':', driveErr.message);
        }

        res.json({ success: true, driveShared });
    } catch (err) {
        console.error('[USERS] Addition failed:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    } finally {
        release();
    }
});

router.post('/users/toggle', checkAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    const release = await globalLock.acquire();
    try {
        const users = safeReadJSON(USERS_FILE);
        const idx = users.findIndex(u => u.id === id);
        if (idx !== -1) {
            users[idx].isActive = !users[idx].isActive;
            saveAtomic(USERS_FILE, users);
            pushToHub('sales_app_users', { ...users[idx], _action: 'TOGGLE' });
            res.json({ success: true, isActive: users[idx].isActive });
        } else {
            res.status(404).json({ success: false });
        }
    } finally {
        release();
    }
});

router.delete('/users/:id', checkAuth, isAdmin, async (req, res) => {
    const release = await globalLock.acquire();
    try {
        let users = safeReadJSON(USERS_FILE);
        const userToDelete = users.find(u => u.id === req.params.id);

        users = users.filter(u => u.id !== req.params.id);
        saveAtomic(USERS_FILE, users);

        if (userToDelete) {
            pushToHub('sales_app_users', { ...userToDelete, _action: 'DELETE', isActive: false });
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
