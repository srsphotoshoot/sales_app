const http = require('http');
const { getPublicUrl } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');
const { SYNC_ERRORS_LOG } = require('../config/paths.cjs');

async function fetchFromHub(category) {
    const CDH_API_URL = process.env.CDH_API_URL || 'http://localhost:8000/api/v1';
    const CDH_API_KEY = process.env.CDH_API_KEY;
    
    if (!CDH_API_KEY) return null;
    
    return new Promise((resolve) => {
        const url = `${CDH_API_URL}/data/${category}?limit=10000`;
        http.get(url, {
            headers: { 'X-API-KEY': CDH_API_KEY }
        }, (res) => {
            let data = '';
            let bytesReceived = 0;
            const MAX_SIZE = 50 * 1024 * 1024; // 50MB safety limit

            res.on('data', (chunk) => {
                bytesReceived += chunk.length;
                if (bytesReceived > MAX_SIZE) {
                    console.error('❌ CDH Fetch Error: Payload too large');
                    res.destroy();
                    resolve(null);
                    return;
                }
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.items || []);
                } catch (e) {
                    console.error('❌ CDH Fetch Parse Error:', e.message);
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error('❌ CDH Fetch Error:', err.message);
            resolve(null);
        });
    });
}

const logSyncError = (error, source, data) => {
    try {
        const errorLog = {
            timestamp: new Date().toISOString(),
            source,
            error: error.message,
            uid: data.uid || data.orderId || 'unknown'
        };
        fs.appendFileSync(SYNC_ERRORS_LOG, JSON.stringify(errorLog) + '\n');
    } catch (e) {
        console.error('Failed to write sync error log:', e);
    }
};

function pushToHub(source, data) {
    const CDH_WEBHOOK_URL = process.env.CDH_WEBHOOK_URL;
    if (!CDH_WEBHOOK_URL) return;
    
    const enrichedData = {
        ...data,
        _syncedAt: new Date().toISOString()
    };
    
    if (source === 'sales_app_products' && enrichedData.imageUrl) {
        enrichedData.imageUrl = getPublicUrl(enrichedData.imageUrl);
    }
    if (source === 'sales_app_branding' && enrichedData.logoUrl) {
        enrichedData.logoUrl = getPublicUrl(enrichedData.logoUrl);
    }

    const url = new URL(CDH_WEBHOOK_URL);
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        family: 4, // Force IPv4 to avoid ::1 resolution issues
        timeout: 5000, // 5s timeout
        headers: {
            'Content-Type': 'application/json',
            'X-Source': source,
            ...(process.env.CDH_API_KEY ? { 'X-API-KEY': process.env.CDH_API_KEY } : {})
        }
    };

    const client = (url.protocol === 'https:') ? require('https') : http;
    const req = client.request(options, (res) => {
        res.on('data', () => {});
    });

    req.on('timeout', () => {
        req.destroy();
        console.warn(`⚠️ CDH Push Timeout (${source})`);
    });

    req.on('error', (e) => {
        console.error(`❌ CDH Push Error (${source}):`, e.message);
        logSyncError(e, source, data);
    });

    req.write(JSON.stringify(enrichedData));
    req.end();
}

function pushToCRM(orderData) {
    const payload = JSON.stringify(orderData);
    const options = {
        hostname: '127.0.0.1',
        port: 8005,
        path: '/api/v1/exhibition/ingest',
        method: 'POST',
        family: 4,
        timeout: 5000,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...(process.env.CRM_API_KEY ? { 'X-API-KEY': process.env.CRM_API_KEY } : {})
        }
    };
    const req = http.request(options, (res) => { res.on('data', () => {}); });
    req.on('timeout', () => req.destroy());
    req.on('error', (e) => console.warn('⚠️ CRM Push Error:', e.message));
    req.write(payload);
    req.end();
}

module.exports = {
    fetchFromHub,
    pushToHub,
    pushToCRM
};
