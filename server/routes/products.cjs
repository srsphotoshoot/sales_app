const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { safeReadJSON, saveAtomic, generateID } = require('../utils/helpers.cjs');
const { fetchFromHub, pushToHub } = require('../utils/hub.cjs');
const { globalLock } = require('../utils/shared.cjs');
const { logInventoryAction } = require('../utils/logging.cjs');
const { checkAuth, isAdmin } = require('../middleware/auth.cjs');
const { uploadProductsToMemory } = require('../config/multer.cjs');
const { uploadImageToDrive } = require('../config/googleDrive.cjs');
const { PRODUCTS_FILE } = require('../config/paths.cjs');

// Products: Fetch list
router.get('/', checkAuth, async (req, res) => {
    const query = (req.query.q || '').toString().toLowerCase().trim();
    try {
        let products = safeReadJSON(PRODUCTS_FILE);
        
        // Logic: No more forced fetchFromHub here. Use a separate /sync endpoint.

        if (query) {
            const terms = query.split(/\s+/).filter(Boolean);
            products = products.filter(p => {
                const barcodeStr = Array.isArray(p.barcodes) ? p.barcodes.join(' ') : '';
                const searchStr = `${p.uid} ${p.id} ${p.name} ${p.color} ${p.category} ${barcodeStr}`.toLowerCase();
                return terms.every(term => searchStr.includes(term));
            });
        }
        res.json(products);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error reading product database' });
    }
});

// Admin: Save a new product
router.post('/save-product', checkAuth, async (req, res) => {
    const newProduct = req.body;
    if (!newProduct.uid || !newProduct.name || !newProduct.id) {
        return res.status(400).json({ success: false, message: 'Invalid product data' });
    }

    const release = await globalLock.acquire();
    try {
        const products = safeReadJSON(PRODUCTS_FILE);
        if (products.find(p => p.uid === newProduct.uid)) {
            return res.status(400).json({ success: false, message: 'Product with this QR already exists' });
        }

        const productToSave = {
            ...newProduct,
            rate: Number(newProduct.rate) || 1.0,
            pcs: Number(newProduct.pcs) || 0,
            ageDays: 0,
            isClearance: false,
            timestamp: new Date().toISOString()
        };

        products.unshift(productToSave);
        if (saveAtomic(PRODUCTS_FILE, products)) {
            logInventoryAction('ADD', {
                uid: productToSave.uid,
                name: productToSave.name,
                newQty: productToSave.pcs,
                user: 'Admin'
            });
            pushToHub('sales_app_products', productToSave);
            res.json({ success: true, product: productToSave });
        } else {
            throw new Error('Atomic write failed');
        }
    } finally {
        release();
    }
});

// Link a barcode to a product (any staff, not admin-only)
router.post('/link-barcode', checkAuth, async (req, res) => {
    const { barcode, productUid } = req.body;
    if (!barcode || !productUid) return res.status(400).json({ success: false, message: 'barcode and productUid required' });
    const release = await globalLock.acquire();
    try {
        const products = safeReadJSON(PRODUCTS_FILE);
        const idx = products.findIndex(p => p.uid === productUid);
        if (idx === -1) return res.status(404).json({ success: false, message: 'Product not found' });
        if (!Array.isArray(products[idx].barcodes)) products[idx].barcodes = [];
        if (!products[idx].barcodes.includes(barcode)) {
            products[idx].barcodes.push(barcode);
            saveAtomic(PRODUCTS_FILE, products);
        }
        res.json({ success: true });
    } finally { release(); }
});

// Update product (any authenticated user — staff needs this during scanning)
router.post('/update', checkAuth, async (req, res) => {
    const { uid, updates } = req.body;
    const release = await globalLock.acquire();
    try {
        let products = safeReadJSON(PRODUCTS_FILE);
        const index = products.findIndex(p => p.uid === uid);
        if (index === -1) return res.status(404).json({ success: false, message: 'Product not found' });

        // Strip immutable fields — only admins can change barcodes via /link-barcode
        const { uid: _uid, source: _source, barcodes: _b, ...safeUpdates } = updates;

        const prevQty = products[index].pcs;
        products[index] = { ...products[index], ...safeUpdates, timestamp: new Date().toISOString() };

        if (saveAtomic(PRODUCTS_FILE, products)) {
            if (updates.pcs !== undefined && updates.pcs !== prevQty) {
                logInventoryAction('UPDATE', {
                    uid,
                    name: products[index].name,
                    prevQty,
                    newQty: updates.pcs,
                    user: 'Admin'
                });
            }
            pushToHub('sales_app_products', products[index]);
            res.json({ success: true, product: products[index] });
        } else {
            throw new Error('Atomic write failed');
        }
    } finally {
        release();
    }
});

// Admin: Bulk Image Upload — images go to the shared Drive folder, not local
// disk, so staff can load them straight from their own (shared) Drive.
router.post('/bulk-images', checkAuth, isAdmin, uploadProductsToMemory.array('images'), async (req, res) => {
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ success: false, message: 'No images uploaded' });

    const release = await globalLock.acquire();
    try {
        const products = safeReadJSON(PRODUCTS_FILE);
        let updatedProducts = [];

        // Index by ID for fast lookup
        const idMap = new Map();
        products.forEach(p => {
            const idKey = String(p.id || '').trim().toLowerCase();
            if (idKey) {
                if (!idMap.has(idKey)) idMap.set(idKey, []);
                idMap.get(idKey).push(p);
            }
        });

        for (const file of files) {
            const originalName = file.originalname;
            const lowercaseName = originalName.toLowerCase();
            let matches = [];

            const leadingDigitsMatch = originalName.match(/^\D*(\d{3,8})/);
            if (leadingDigitsMatch) {
                const extracted = leadingDigitsMatch[1];
                const normalized = extracted.replace(/^0+/, '') || '0';
                matches = idMap.get(extracted.toLowerCase()) || idMap.get(normalized.toLowerCase()) || [];
                if (matches.length === 0) {
                    matches = products.filter(p =>
                        String(p.name).toLowerCase().includes(extracted) ||
                        String(p.uid).toLowerCase().includes(extracted)
                    );
                }
            }

            if (matches.length === 0) {
                matches = products.filter(p =>
                    lowercaseName.includes(p.uid.toLowerCase()) ||
                    (p.name.length > 3 && lowercaseName.includes(p.name.toLowerCase()))
                );
            }

            if (matches.length === 0) continue;

            const fileId = await uploadImageToDrive(file.buffer, originalName, file.mimetype);
            matches.forEach(p => {
                p.imageUrl = `drive:${fileId}`;
                updatedProducts.push(p);
            });
        }

        if (updatedProducts.length > 0) {
            saveAtomic(PRODUCTS_FILE, products);
            updatedProducts.forEach(p => pushToHub('sales_app_products', p));
        }
        res.json({ success: true, updatedCount: updatedProducts.length });
    } catch (err) {
        console.error('[PRODUCTS] Bulk image upload failed:', err.message);
        res.status(500).json({ success: false, message: 'Drive upload failed: ' + err.message });
    } finally {
        release();
    }
});

// Admin: Single image upload → returns a drive:<fileId> reference
router.post('/upload-image', checkAuth, isAdmin, uploadProductsToMemory.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    try {
        const fileId = await uploadImageToDrive(req.file.buffer, req.file.originalname, req.file.mimetype);
        res.json({ success: true, url: `drive:${fileId}` });
    } catch (err) {
        console.error('[PRODUCTS] Image upload failed:', err.message);
        res.status(500).json({ success: false, message: 'Drive upload failed: ' + err.message });
    }
});

// Admin: Get all color variants of a product by base ID
router.get('/variants/:id', checkAuth, (req, res) => {
    const products = safeReadJSON(PRODUCTS_FILE);
    res.json(products.filter(p => String(p.id) === String(req.params.id)));
});

// Admin: Create / update / delete color variants in one shot
router.post('/variants/save', checkAuth, isAdmin, async (req, res) => {
    const { baseId, variants } = req.body;
    if (!baseId || !Array.isArray(variants)) {
        return res.status(400).json({ success: false, message: 'Invalid data' });
    }

    const release = await globalLock.acquire();
    try {
        const products = safeReadJSON(PRODUCTS_FILE);
        const baseProduct = products.find(p => String(p.id) === String(baseId));

        for (const v of variants) {
            const images = Array.isArray(v.images) ? v.images : [];
            const primaryUrl = images[0] || v.imageUrl || '';

            if (v.isDeleted && v.uid) {
                const idx = products.findIndex(p => p.uid === v.uid);
                if (idx !== -1) products.splice(idx, 1);
                continue;
            }

            if (v.isNew) {
                const uid = `${baseId}-${String(v.color).toUpperCase()}-${crypto.randomBytes(4).toString('hex')}`;
                products.unshift({
                    ...(baseProduct || {}),
                    uid,
                    id: baseId,
                    name: baseProduct?.name || String(baseId),
                    category: baseProduct?.category || '',
                    color: String(v.color).toUpperCase(),
                    pcs: Number(v.pcs) || 0,
                    rate: Number(v.rate) || Number(baseProduct?.rate) || 0,
                    images,
                    imageUrl: primaryUrl,
                    ageDays: 0,
                    isClearance: false,
                    isBestSeller: false,
                    isUrgent: false,
                    isGoodSignal: false,
                    status: 'Fresh',
                    timestamp: new Date().toISOString()
                });
            } else if (v.uid) {
                const idx = products.findIndex(p => p.uid === v.uid);
                if (idx !== -1) {
                    products[idx].images = images;
                    if (primaryUrl) products[idx].imageUrl = primaryUrl;
                }
            }
        }

        if (saveAtomic(PRODUCTS_FILE, products)) {
            res.json({ success: true });
        } else {
            throw new Error('Write failed');
        }
    } finally {
        release();
    }
});

// Admin: Sync from Hub — merges hub products with local ones (never deletes local-only products)
router.post('/sync', checkAuth, isAdmin, async (req, res) => {
    const release = await globalLock.acquire();
    try {
        const hubProducts = await fetchFromHub('products');
        if (!hubProducts || hubProducts.length === 0) {
            return res.status(503).json({ success: false, message: 'Hub unreachable or returned no data' });
        }

        const localProducts = safeReadJSON(PRODUCTS_FILE);
        const hubUids = new Set(hubProducts.map(p => p.uid));

        // Keep local-only products (not present in hub) — these were registered via FastProductCreator
        const localOnly = localProducts.filter(p => !hubUids.has(p.uid));

        // Hub products take precedence for shared UIDs; prepend local-only products
        const merged = [...localOnly, ...hubProducts];

        if (!saveAtomic(PRODUCTS_FILE, merged)) throw new Error('Write failed');
        res.json({ success: true, count: merged.length, hubCount: hubProducts.length, localOnly: localOnly.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Sync internal error' });
    } finally {
        release();
    }
});

// Admin: Delete product
router.delete('/:uid', checkAuth, isAdmin, async (req, res) => {
    const { uid } = req.params;
    const release = await globalLock.acquire();
    try {
        let products = safeReadJSON(PRODUCTS_FILE);
        const productToDelete = products.find(p => p.uid === uid);
        
        products = products.filter(p => p.uid !== uid);
        if (saveAtomic(PRODUCTS_FILE, products)) {
            if (productToDelete) {
                logInventoryAction('DELETE', { uid, name: productToDelete.name, user: 'Admin' });
                // No hub delete yet, maybe send a special action
                pushToHub('sales_app_products', { ...productToDelete, _action: 'DELETE', pcs: 0 });
            }
            res.json({ success: true });
        } else {
            throw new Error('Database Write Error');
        }
    } finally {
        release();
    }
});

module.exports = router;

