const multer = require('multer');
const path = require('path');
const { UPLOADS_DIR, PRODUCT_IMAGES_DIR } = require('./paths.cjs');

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

const imageFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMES.has(file.mimetype) && ALLOWED_EXTS.has(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Only image files are allowed (jpeg, png, webp, gif). Got: ${file.mimetype}`), false);
    }
};

// Configure Multer for Logo
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = require('path').join(UPLOADS_DIR, 'logo');
        if (!require('fs').existsSync(dest)) {
            require('fs').mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
    },
    filename: (req, file, cb) => cb(null, 'logo.png')
});
const uploadLogo = multer({
    storage: logoStorage,
    fileFilter: imageFilter,
    limits: { fileSize: MAX_SIZE_BYTES }
});

// Configure Multer for Bulk Product Images
const productStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRODUCT_IMAGES_DIR),
    filename: (req, file, cb) => {
        // Sanitize original filename: strip path separators and non-safe chars
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.\./g, '_');
        cb(null, Date.now() + '-' + safe);
    }
});
const uploadProducts = multer({
    storage: productStorage,
    fileFilter: imageFilter,
    limits: { fileSize: MAX_SIZE_BYTES }
});

module.exports = { uploadLogo, uploadProducts };
