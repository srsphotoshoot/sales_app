import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, RefreshCw, BookOpen, X, Loader2, ImageOff,
  Settings, Download, Wifi, WifiOff, Trash2, CheckCircle2, Maximize2
} from 'lucide-react';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { getBaseUrl, fetchImageBlobUrl } from '../services/api.js';

// ── Cache constants & utilities ────────────────────────────────────────────

const CACHE_DIR = 'cdh_images';
const PREF_CACHE_KEY = 'img_cache_enabled';

function isOnWifi() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.type) return conn.type === 'wifi';
  return navigator.onLine; // fallback: allow if online
}

async function fsCached(fileId) {
  try {
    await Filesystem.stat({ path: `${CACHE_DIR}/${fileId}.jpg`, directory: Directory.Cache });
    return true;
  } catch { return false; }
}

async function fsRead(fileId) {
  try {
    const r = await Filesystem.readFile({ path: `${CACHE_DIR}/${fileId}.jpg`, directory: Directory.Cache });
    return `data:image/jpeg;base64,${r.data}`;
  } catch { return null; }
}

async function fsWrite(fileId, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    try { await Filesystem.mkdir({ path: CACHE_DIR, directory: Directory.Cache, recursive: true }); } catch {}
    await Filesystem.writeFile({ path: `${CACHE_DIR}/${fileId}.jpg`, data: base64, directory: Directory.Cache });
    return true;
  } catch { return false; }
}

async function fsClear() {
  try {
    const { files } = await Filesystem.readdir({ path: CACHE_DIR, directory: Directory.Cache });
    for (const f of files) {
      await Filesystem.deleteFile({ path: `${CACHE_DIR}/${f.name}`, directory: Directory.Cache });
    }
    return files.length;
  } catch { return 0; }
}

// Collect all unique fileIds from catalog
function collectFileIds(catalog) {
  const ids = new Set();
  for (const p of catalog) {
    for (const v of (Array.isArray(p.variants) ? p.variants : [])) {
      for (const fid of (Array.isArray(v.images) ? v.images : [])) {
        if (fid) ids.add(fid);
      }
    }
  }
  return [...ids];
}

// ── CDH URL builder — routes through sales server proxy ──────────────────────

function getCDHImageUrl(fileId, baseUrl, width = null) {
  if (!fileId) return '';
  const root = (baseUrl || '').replace(/\/$/, '');
  const wParam = width ? `?w=${width}` : '';
  return `${root}/api/catalog/image/${fileId}${wParam}`;
}

// ── CatalogImage ─────────────────────────────────────────────────────────────

// thumbnail=true  → fetch ?w=300 from network (fast, always works, for grid cards)
// thumbnail=false → load full quality from local cache only (requires offline download)
function CatalogImage({ fileId, name, baseUrl, cacheEnabled, cacheVersion = 0, height = 140, thumbnail = false }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!fileId) { setSrc(null); return; }
    let alive = true;
    setSrc(null);

    const load = async () => {
      if (thumbnail) {
        // Grid: always fetch thumbnail from network (small, fast)
        const url = getCDHImageUrl(fileId, baseUrl, 300);
        if (!url) return;
        const blobUrl = await fetchImageBlobUrl(url);
        if (alive) setSrc(blobUrl);
      } else {
        // Detail modal: try local cache first (best quality), then network fallback
        if (cacheEnabled) {
          const cached = await fsRead(fileId);
          if (cached && alive) { setSrc(cached); return; }
        }
        // Fallback: fetch full quality from network
        const url = getCDHImageUrl(fileId, baseUrl);
        if (!url) return;
        const blobUrl = await fetchImageBlobUrl(url);
        if (alive) setSrc(blobUrl);
      }
    };

    load();
    return () => { alive = false; };
  }, [fileId, cacheEnabled, baseUrl, cacheVersion, thumbnail]);

  const ph = { width: '100%', height, background: 'rgba(255,255,255,0.05)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  if (!fileId || !src) return <div style={ph}><ImageOff size={28} style={{ opacity: 0.25 }} /></div>;
  return <img src={src} alt={name} style={{ width: '100%', height, objectFit: 'cover', borderRadius: '10px' }} />;
}

// ── ColorChip ─────────────────────────────────────────────────────────────────

function ColorChip({ color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '20px',
      background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)',
      fontSize: '0.65rem', fontWeight: '600', border: '1px solid var(--glass-border)',
      textTransform: 'capitalize', marginRight: '4px', marginBottom: '4px'
    }}>{color}</span>
  );
}

// ── Image Cache Settings Panel ─────────────────────────────────────────────

function ImageCachePanel({ catalog, baseUrl, onClose }) {
  const [enabled, setEnabled] = useState(false);
  const [wifi, setWifi] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [stats, setStats] = useState({ cached: 0, total: 0 });
  const [cleared, setCleared] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    setWifi(isOnWifi());
    Preferences.get({ key: PREF_CACHE_KEY }).then(({ value }) => setEnabled(value === 'true'));
    refreshStats();
  }, []);

  async function refreshStats() {
    const ids = collectFileIds(catalog);
    let cached = 0;
    for (const id of ids) { if (await fsCached(id)) cached++; }
    setStats({ cached, total: ids.length });
  }

  async function toggleEnabled(val) {
    setEnabled(val);
    await Preferences.set({ key: PREF_CACHE_KEY, value: String(val) });
  }

  async function handleDownload() {
    if (isDownloading) {
      abortRef.current = true;
      return;
    }
    abortRef.current = false;
    setIsDownloading(true);
    setCleared(false);

    const ids = collectFileIds(catalog);
    setProgress({ done: 0, total: ids.length });

    let done = 0;
    for (const fileId of ids) {
      if (abortRef.current) break;
      const already = await fsCached(fileId);
      if (!already) {
        await fsWrite(fileId, getCDHImageUrl(fileId, baseUrl));
        await new Promise(r => setTimeout(r, 30));
      }
      if (await fsCached(fileId)) done++;
      setProgress({ done, total: ids.length });
    }

    setIsDownloading(false);
    refreshStats();
  }

  async function handleClear() {
    const n = await fsClear();
    setCleared(true);
    setStats(s => ({ ...s, cached: 0 }));
    setTimeout(() => setCleared(false), 2500);
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const canDownload = enabled && wifi && !isDownloading;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ width: '100%', background: 'var(--secondary-bg)', borderRadius: '20px 20px 0 0', padding: '24px', paddingBottom: '36px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={20} color="var(--accent-new)" />
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>Image Cache Settings</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        {/* Main toggle */}
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '16px', marginBottom: '12px', border: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div>
              <p style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem' }}>High-Quality Image Cache</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Download & store catalog images locally</p>
            </div>
            {/* Toggle switch */}
            <div
              onClick={() => toggleEnabled(!enabled)}
              style={{
                width: '52px', height: '28px', borderRadius: '14px', position: 'relative', cursor: 'pointer',
                background: enabled ? 'var(--accent-new)' : 'rgba(255,255,255,0.12)',
                transition: 'background 0.2s', flexShrink: 0
              }}
            >
              <div style={{
                position: 'absolute', top: '4px', width: '20px', height: '20px', borderRadius: '50%',
                background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                left: enabled ? '28px' : '4px', transition: 'left 0.2s'
              }} />
            </div>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            {enabled
              ? 'ON — images load instantly from device storage. Auto-downloads on WiFi when you open this page.'
              : 'OFF — images stream from CDH server each time (requires internet).'}
          </p>
        </div>

        {/* WiFi status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: wifi ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', marginBottom: '12px' }}>
          {wifi ? <Wifi size={16} color="var(--accent-new)" /> : <WifiOff size={16} color="#ef4444" />}
          <p style={{ fontSize: '0.8rem', color: wifi ? 'var(--accent-new)' : '#ef4444', fontWeight: '600' }}>
            {wifi ? 'WiFi connected — ready to download' : 'Not on WiFi — connect to WiFi to download images'}
          </p>
        </div>

        {/* Cache stats */}
        {stats.total > 0 && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', marginBottom: '16px', border: '1px solid var(--glass-border)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>CACHE STATUS</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((stats.cached / stats.total) * 100)}%`, background: 'var(--accent-new)', borderRadius: '3px', transition: 'width 0.4s' }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--accent-new)', fontWeight: '700', minWidth: '60px', textAlign: 'right' }}>
                {stats.cached}/{stats.total}
              </p>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{stats.cached} images cached out of {stats.total} total</p>
          </div>
        )}

        {/* Download progress */}
        {isDownloading && (
          <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', marginBottom: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--accent-new)', fontWeight: '600' }}>Downloading...</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--accent-new)', fontWeight: '700' }}>{pct}%</p>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent-new)', borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>{progress.done} / {progress.total} images</p>
          </div>
        )}

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={!enabled || (!wifi && !isDownloading)}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px', fontSize: '0.95rem', fontWeight: '700',
            background: isDownloading ? 'rgba(239,68,68,0.15)' : (canDownload ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)'),
            color: isDownloading ? '#ef4444' : (canDownload ? 'var(--accent-new)' : 'var(--text-muted)'),
            border: `1px solid ${isDownloading ? 'rgba(239,68,68,0.3)' : (canDownload ? 'rgba(16,185,129,0.3)' : 'var(--glass-border)')}`,
            cursor: (!enabled || (!wifi && !isDownloading)) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            marginBottom: '10px', transition: 'all 0.2s'
          }}
        >
          {isDownloading ? (
            <><X size={18} /> Cancel Download</>
          ) : (
            <><Download size={18} /> {stats.cached === stats.total && stats.total > 0 ? 'Re-download All Images' : 'Download All Images'}</>
          )}
        </button>

        {!enabled && (
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '10px' }}>
            Enable cache first to download images
          </p>
        )}
        {enabled && !wifi && (
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '10px' }}>
            Connect to WiFi to download images
          </p>
        )}

        {/* Clear cache */}
        {stats.cached > 0 && (
          <button
            onClick={handleClear}
            style={{
              width: '100%', padding: '12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '600',
              background: cleared ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
              color: cleared ? 'var(--accent-new)' : '#ef4444',
              border: `1px solid ${cleared ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            {cleared ? <><CheckCircle2 size={16} /> Cache Cleared</> : <><Trash2 size={16} /> Clear Cache ({stats.cached} images)</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Fullscreen Image Viewer ────────────────────────────────────────────────

function FullscreenImageViewer({ fileId, name, baseUrl, cacheEnabled, cacheVersion, onClose }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    setLoading(true);
    setSrc(null);
    const load = async () => {
      if (cacheEnabled) {
        const cached = await fsRead(fileId);
        if (cached && alive) { setSrc(cached); setLoading(false); return; }
      }
      const url = getCDHImageUrl(fileId, baseUrl);
      if (!url) { setLoading(false); return; }
      const blobUrl = await fetchImageBlobUrl(url);
      if (alive) { setSrc(blobUrl); setLoading(false); }
    };
    load();
    return () => { alive = false; };
  }, [fileId, cacheEnabled, baseUrl, cacheVersion]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '44px', height: '44px', color: 'white', cursor: 'pointer', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={22} />
      </button>
      {loading ? (
        <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', color: 'rgba(255,255,255,0.4)' }} />
      ) : src ? (
        <img
          src={src}
          alt={name}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <ImageOff size={60} style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Image not available</p>
        </div>
      )}
      {name && (
        <p style={{ position: 'absolute', bottom: '28px', color: 'rgba(255,255,255,0.45)', fontSize: '0.8rem', textAlign: 'center', padding: '0 20px' }}>{name}</p>
      )}
    </div>
  );
}

// ── Add-to-cart Modal ──────────────────────────────────────────────────────

function AddToCartModal({ product, baseUrl, cacheEnabled, cacheVersion = 0, onAdd, onClose }) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const [selectedVariant, setSelectedVariant] = useState(variants[0] || null);
  const [qty, setQty] = useState(1);
  const [type, setType] = useState('sale');
  const [fullscreenImage, setFullscreenImage] = useState(null);

  const firstImage = selectedVariant?.images?.[0] || null;

  const handleAdd = () => {
    if (!selectedVariant) return;
    onAdd({
      uid: `CDH-${product.id}-${selectedVariant.color}`,
      id: String(product.id),
      name: product.name,
      color: selectedVariant.color,
      colors: variants.map(v => v.color),
      rate: product.rate || product.price || product.mrp || product.sellingPrice || 0,
      pcs: product.stock_quantity || product.stock || product.pcs || 999,
      imageUrl: firstImage ? getCDHImageUrl(firstImage, baseUrl) : '',
      type, qty,
      fromCatalog: true,
    });
    onClose();
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
        <div style={{ width: '100%', background: 'var(--secondary-bg)', borderRadius: '20px 20px 0 0', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>{product.name}</h3>
              {product.price > 0 && <p style={{ fontSize: '0.8rem', color: 'var(--accent-new)', fontWeight: '600' }}>₹{product.price}</p>}
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={22} /></button>
          </div>

          {firstImage && (
            <div
              style={{ marginBottom: '16px', position: 'relative', cursor: 'pointer' }}
              onClick={() => setFullscreenImage(firstImage)}
            >
              <CatalogImage fileId={firstImage} name={product.name} baseUrl={baseUrl} cacheEnabled={cacheEnabled} cacheVersion={cacheVersion} height={240} />
              <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', borderRadius: '8px', padding: '5px 9px', display: 'flex', alignItems: 'center', gap: '5px', backdropFilter: 'blur(4px)' }}>
                <Maximize2 size={13} color="white" />
                <span style={{ fontSize: '0.65rem', color: 'white', fontWeight: '600' }}>Full Preview</span>
              </div>
            </div>
          )}

          {variants.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '600' }}>SELECT COLOR</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {variants.map(v => (
                  <button key={v.color} onClick={() => setSelectedVariant(v)} style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer',
                    background: selectedVariant?.color === v.color ? 'var(--accent-new)' : 'rgba(255,255,255,0.08)',
                    color: selectedVariant?.color === v.color ? '#fff' : 'var(--text-main)',
                    border: `1px solid ${selectedVariant?.color === v.color ? 'var(--accent-new)' : 'var(--glass-border)'}`,
                    transition: 'all 0.15s ease'
                  }}>{v.color}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
            {[['sale', '🛒 Sale'], ['interest', '❤️ Interest']].map(([t, label]) => (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: '10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer',
                background: type === t ? (t === 'sale' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'rgba(255,255,255,0.05)',
                color: type === t ? (t === 'sale' ? 'var(--accent-new)' : '#ef4444') : 'var(--text-muted)',
                border: `1px solid ${type === t ? (t === 'sale' ? 'var(--accent-new)' : '#ef4444') : 'var(--glass-border)'}`,
              }}>{label}</button>
            ))}
          </div>

          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>QTY</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: '1.2rem', fontWeight: '700', minWidth: '30px', textAlign: 'center' }}>{qty}</span>
              <button onClick={() => setQty(q => q + 1)} style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(16,185,129,0.3)', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
          </div>

          <button onClick={handleAdd} disabled={!selectedVariant} style={{
            width: '100%', padding: '14px', borderRadius: '14px', fontSize: '1rem', fontWeight: '700',
            background: 'var(--accent-new)', color: 'white', border: 'none', cursor: 'pointer',
            opacity: selectedVariant ? 1 : 0.5, transition: 'opacity 0.15s'
          }}>Add to Cart</button>
        </div>
      </div>

      {fullscreenImage && (
        <FullscreenImageViewer
          fileId={fullscreenImage}
          name={product.name}
          baseUrl={baseUrl}
          cacheEnabled={cacheEnabled}
          cacheVersion={cacheVersion}
          onClose={() => setFullscreenImage(null)}
        />
      )}
    </>
  );
}

// ── Main CatalogSection ────────────────────────────────────────────────────

export default function CatalogSection({ onAddToCart }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);
  const bgDownloadRef = useRef(false);

  // Load cache preference
  useEffect(() => {
    Preferences.get({ key: PREF_CACHE_KEY }).then(({ value }) => {
      setCacheEnabled(value === 'true');
    });
  }, []);

  const loadCatalog = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const url = await getBaseUrl();
      setBaseUrl(url || '');
      const suffix = forceRefresh ? '?refresh=1' : '';
      const headers = { 'ngrok-skip-browser-warning': 'true' };
      const { value: sessionData } = await Preferences.get({ key: 'auth_session' });
      if (sessionData) {
        const { token } = JSON.parse(sessionData);
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${url}/api/catalog${suffix}`, { headers });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const items = data.catalog || [];
      setCatalog(items);

      // Auto background-download if cache is enabled and on WiFi
      const { value: cacheVal } = await Preferences.get({ key: PREF_CACHE_KEY });
      if (cacheVal === 'true' && isOnWifi() && !bgDownloadRef.current) {
        bgDownloadRef.current = true;
        backgroundDownload(items, url).finally(() => { bgDownloadRef.current = false; });
      }
    } catch (e) {
      console.error('Catalog load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Background download — silent, no UI (settings panel shows progress separately)
  async function backgroundDownload(items, url) {
    const ids = collectFileIds(items);
    for (const fileId of ids) {
      if (!(await fsCached(fileId))) {
        await fsWrite(fileId, getCDHImageUrl(fileId, url));
        await new Promise(r => setTimeout(r, 40));
      }
    }
  }

  const filtered = catalog.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) ||
      (Array.isArray(p.variants) && p.variants.some(v => v.color?.toLowerCase().includes(q)));
  });

  return (
    <div style={{ paddingBottom: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={22} color="var(--accent-new)" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700' }}>CDH Catalog</h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.07)', padding: '2px 8px', borderRadius: '20px' }}>
            {catalog.length}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Cache indicator dot */}
          {cacheEnabled && (
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnWifi() ? 'var(--accent-new)' : '#f59e0b' }} title="Image cache on" />
          )}
          <button onClick={() => setShowSettings(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <Settings size={18} />
          </button>
          <button onClick={() => loadCatalog(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Cache ON badge */}
      {cacheEnabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)', marginBottom: '12px' }}>
          <Wifi size={13} color="var(--accent-new)" />
          <p style={{ fontSize: '0.72rem', color: 'var(--accent-new)', fontWeight: '600' }}>
            High-quality cache ON — images load from device storage
          </p>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search catalog..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 12px 10px 38px', borderRadius: '12px', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '0.9rem', outline: 'none' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
          <p>Loading catalog from CDH...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <BookOpen size={40} style={{ opacity: 0.2, marginBottom: '12px' }} />
          <p>{catalog.length === 0 ? 'Catalog unavailable — check CDH connection' : 'No products found'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {filtered.map(product => {
            const variants = Array.isArray(product.variants) ? product.variants : [];
            const firstImage = variants[0]?.images?.[0] || null;
            return (
              <div
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                style={{ background: 'var(--secondary-bg)', borderRadius: '14px', padding: '12px', border: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'transform 0.15s ease, border-color 0.15s ease', position: 'relative', overflow: 'hidden' }}
                onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <CatalogImage fileId={firstImage} name={product.name} baseUrl={baseUrl} cacheEnabled={cacheEnabled} cacheVersion={cacheVersion} thumbnail={true} />
                <div style={{ marginTop: '10px' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px', lineHeight: '1.3' }}>{product.name}</p>
                  {product.price > 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--accent-new)', fontWeight: '700', marginBottom: '6px' }}>₹{product.price}</p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {variants.slice(0, 3).map(v => <ColorChip key={v.color} color={v.color} />)}
                    {variants.length > 3 && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', padding: '2px 0' }}>+{variants.length - 3}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add to Cart Modal */}
      {selectedProduct && (
        <AddToCartModal
          product={selectedProduct}
          baseUrl={baseUrl}
          cacheEnabled={cacheEnabled}
          cacheVersion={cacheVersion}
          onAdd={item => { onAddToCart && onAddToCart(item); }}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Image Cache Settings Panel */}
      {showSettings && (
        <ImageCachePanel
          catalog={catalog}
          baseUrl={baseUrl}
          onClose={() => {
            setShowSettings(false);
            Preferences.get({ key: PREF_CACHE_KEY }).then(({ value }) => setCacheEnabled(value === 'true'));
            setCacheVersion(v => v + 1); // force CatalogImage to re-check cache
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
