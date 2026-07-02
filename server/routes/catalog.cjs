const express = require('express');
const router = express.Router();
const http = require('http');
const { checkAuth } = require('../middleware/auth.cjs');

function getCDHBase() {
  const url = process.env.CDH_API_URL || 'http://localhost:8000/api/v1';
  return url.replace(/\/api\/v1\/?$/, '');
}

let catalogCache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function fetchCatalogFromCDH() {
  return new Promise((resolve) => {
    const url = `${getCDHBase()}/api/v1/catalog`;

    http.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch {
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.error('Catalog fetch error:', err.message);
      resolve([]);
    }).on('timeout', function () {
      this.destroy();
      resolve([]);
    });
  });
}

// GET /api/catalog/image/:fileId — proxy to CDH image (no auth needed, public read)
router.get('/image/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) return res.status(400).json({ error: 'Invalid file ID' });

  const w = req.query.w ? `?w=${parseInt(req.query.w, 10)}` : '';
  const url = `${getCDHBase()}/api/v1/catalog/image/${fileId}${w}`;

  http.get(url, { timeout: 10000 }, (cdhRes) => {
    res.status(cdhRes.statusCode);
    const ct = cdhRes.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    cdhRes.pipe(res);
  }).on('error', () => res.status(502).end())
    .on('timeout', function () { this.destroy(); res.status(504).end(); });
});

// GET /api/catalog/lookup/:id — single product from cache (fast, no CDH call)
router.get('/lookup/:id', checkAuth, (req, res) => {
  const catalog = catalogCache || [];
  const product = catalog.find(p => String(p.id) === String(req.params.id));
  if (!product) return res.json({ found: false });
  res.json({ found: true, product });
});

// GET /api/catalog — returns CDH catalog (1h cache, ?refresh=1 to force)
router.get('/', checkAuth, async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  if (!forceRefresh && catalogCache && Date.now() - cacheTime < CACHE_TTL) {
    return res.json({ success: true, cached: true, catalog: catalogCache });
  }

  const catalog = await fetchCatalogFromCDH();
  catalogCache = catalog;
  cacheTime = Date.now();
  res.json({ success: true, cached: false, catalog });
});

module.exports = router;
