const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Manual .env loading
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            if (value.length > 0 && value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
            process.env[key] = value;
        }
    });
}

const {
    DATA_DIR, UPLOADS_DIR, PRODUCT_IMAGES_DIR,
    KEYS_FILE, PRODUCTS_FILE, SALES_FILE, LOGS_FILE, USERS_FILE, BRANDING_FILE, EXHIBITION_FILE
} = require('./config/paths.cjs');

const app = express();
const PORT = process.env.PORT || 5001;

// Ensure necessary directories exist
[UPLOADS_DIR, PRODUCT_IMAGES_DIR, path.join(UPLOADS_DIR, 'logo')].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize array-based files if they don't exist
[KEYS_FILE, PRODUCTS_FILE, SALES_FILE, LOGS_FILE, USERS_FILE, EXHIBITION_FILE].forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify([]));
    }
});

// Initialize object-based files with defaults
if (!fs.existsSync(BRANDING_FILE)) {
    fs.writeFileSync(BRANDING_FILE, JSON.stringify({ logoPosition: 'top-right' }));
}

const ALLOWED_ORIGINS = [
    'https://romits-macbook-air-1.tailc0bf65.ts.net',
    'https://napping-briskness-shimmy.ngrok-free.dev',
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
    'http://localhost:5173',
    'http://localhost:4000',
    'http://127.0.0.1:5173',
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no Origin (mobile apps, curl, same-host server-side)
        if (!origin) return callback(null, true);
        // Allow exact matches or any *.ngrok-free.dev / *.ngrok.io domain
        if (ALLOWED_ORIGINS.includes(origin) || /https?:\/\/[^/]+\.ngrok(-free)?\.dev$/.test(origin) || /https?:\/\/[^/]+\.ngrok\.io$/.test(origin) || /https?:\/\/[^/]+\.trycloudflare\.com$/.test(origin)) {
            return callback(null, true);
        }
        callback(new Error('CORS: origin not allowed'));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning', 'Authorization', 'X-API-KEY']
}));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Health Check
app.get('/api/health', async (req, res) => {
    const hubUrl = process.env.CDH_API_URL || 'http://localhost:8000/api/v1';
    let hubStatus = 'offline';
    
    try {
        const timeout = 2000;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(`${hubUrl.replace(/\/$/, '')}/status`, {
            signal: controller.signal,
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        clearTimeout(id);
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'healthy') hubStatus = 'online';
        }
    } catch (e) {
        hubStatus = 'offline';
    }

    res.json({ 
        success: true, 
        timestamp: new Date().toISOString(),
        hubStatus,
        version: '1.1.0'
    });
});

// Routes
const adminRoutes = require('./routes/admin.cjs');
const productRoutes = require('./routes/products.cjs');
const salesRoutes = require('./routes/sales.cjs');
const authRoutes = require('./routes/auth.cjs');
const inventoryRoutes = require('./routes/inventory.cjs');
const catalogRoutes = require('./routes/catalog.cjs');
const exhibitionRoutes = require('./routes/exhibition.cjs');
const { safeReadJSON } = require('./utils/helpers.cjs');
const { pushToHub } = require('./utils/hub.cjs');

app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/exhibition', exhibitionRoutes);
// Serve static frontend files from 'dist' directory
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Fallback for Single Page Application (SPA) routing
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        next();
    }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('🔥 [CRITICAL ERROR]:', err.message);
    console.error(err.stack);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(err.status || 500).json({
        success: false,
        message: isProd ? 'Internal Server Error' : (err.message || 'Internal Server Error')
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});

// ── Auto-sync: push all products to CDH every 30 minutes (single batch request) ──
async function pushAllProductsToCDH() {
    const webhookUrl = process.env.CDH_WEBHOOK_URL;
    const apiKey = process.env.CDH_API_KEY;
    if (!webhookUrl) return;
    try {
        const products = safeReadJSON(PRODUCTS_FILE);
        const url = new URL(webhookUrl);
        const payload = JSON.stringify({ _batch: true, items: products, _syncedAt: new Date().toISOString() });
        const client = url.protocol === 'https:' ? require('https') : require('http');
        const req = client.request({
            hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname, method: 'POST', family: 4, timeout: 30000,
            headers: {
                'Content-Type': 'application/json', 'X-Source': 'sales_app_products_bulk',
                'Content-Length': Buffer.byteLength(payload),
                ...(apiKey ? { 'X-API-KEY': apiKey } : {})
            }
        }, (res) => { res.on('data', () => {}); });
        req.on('timeout', () => req.destroy());
        req.on('error', e => console.error('CDH auto-sync error:', e.message));
        req.write(payload);
        req.end();
    } catch (err) {
        console.error('CDH auto-sync error:', err.message);
    }
}

// Initial push 30s after startup
setTimeout(pushAllProductsToCDH, 30000);
// Re-push every 30 minutes
setInterval(pushAllProductsToCDH, 30 * 60 * 1000);
