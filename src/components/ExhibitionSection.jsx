import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Preferences } from '@capacitor/preferences';
import {
  ArrowLeft, Upload, FileDown, Trash2, CheckCircle, AlertCircle,
  Package, X, Loader2, Image as ImageIcon, ChevronDown, ChevronUp,
  ShoppingCart, Plus, Minus, User, CreditCard, RefreshCw, Scan, Search
} from 'lucide-react';
import { fetchExhibition, saveExhibitionItems, clearExhibition, getBaseUrl, getAuthHeaders } from '../services/api';
import AuthImage from './AuthImage';
import { getAbsoluteImageUrl } from '../services/api';
import OCRScanner from './OCRScanner';
import QRScanner from './QRScanner';
import { Ocr } from '@capacitor-community/image-to-text';

// ── Excel template download ────────────────────────────────────────────────
const downloadTemplate = async () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['product_code', 'colours', 'rate', 'stock', 'uid'],
    ['8596', 'RED,BLUE,GREEN', 1550, 20, '26859600,36859601'],
    ['8690', 'RANI,PURPLE,ORANGE', 3495, '', '38690001'],
    ['8424', '', 6995, 15, ''],
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Exhibition');
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  const filename = 'exhibition_template.xlsx';
  await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
  await Share.share({ title: filename, url: uri });
};

// ── Catalogue matcher ──────────────────────────────────────────────────────
const matchWithCatalogue = (rows, products) => {
  return rows.map(row => {
    const code = String(row.product_code ?? row['Product Code'] ?? row['PRODUCT CODE'] ?? row.code ?? '').trim();
    if (!code) return null;
    const rate = Number(row.rate ?? row['Rate'] ?? row['RATE'] ?? 0) || 0;
    const stock = (row.stock !== undefined && row.stock !== '') ? Number(row.stock ?? row['Stock'] ?? row['STOCK']) : null;
    const coloursRaw = String(row.colours ?? row['Colours'] ?? row['COLOURS'] ?? row.colors ?? '');
    const uidRaw = String(row.uid ?? row['uid'] ?? row['UID'] ?? row['Uid'] ?? '').trim();
    const uids = uidRaw ? uidRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const variants = products.filter(p => String(p.id).trim() === code);
    const matched = variants.length > 0;
    const colours = matched
      ? [...new Set(variants.map(p => p.color).filter(Boolean))]
      : coloursRaw.split(',').map(s => s.trim()).filter(Boolean);
    const images = matched
      ? [...new Set(variants.flatMap(p => Array.isArray(p.images) && p.images.length ? p.images : p.imageUrl ? [p.imageUrl] : []))]
      : [];
    const effectiveRate = rate || (matched && variants[0]?.rate) || 0;
    const name = matched ? (variants[0]?.name || code) : code;
    return { productCode: code, name, colours, rate: effectiveRate, stock, uids, catalogueMatched: matched, images };
  }).filter(Boolean);
};

// ── Shop config ────────────────────────────────────────────────────────────
const SHOPS = {
  srs:     { label: 'SRS',     color: '#6366f1', bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.4)'  },
  radhika: { label: 'Radhika', color: '#ec4899', bg: 'rgba(236,72,153,0.15)', border: 'rgba(236,72,153,0.4)' },
};

// ── ColourChip ─────────────────────────────────────────────────────────────
const ColourChip = ({ colour, selected, onClick }) => (
  <span
    onClick={onClick}
    style={{
      padding: '5px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600',
      background: selected ? '#6366f1' : 'rgba(99,102,241,0.12)',
      color: selected ? 'white' : '#a5b4fc',
      border: `1px solid ${selected ? '#6366f1' : 'rgba(99,102,241,0.3)'}`,
      whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.15s',
    }}
  >
    {colour}
  </span>
);

// ── Source badge ───────────────────────────────────────────────────────────
const SourceBadge = ({ source }) => {
  const shop = SHOPS[source];
  if (!shop) return null;
  return (
    <span style={{
      fontSize: '0.6rem', fontWeight: '800', padding: '2px 6px', borderRadius: '6px',
      background: shop.bg, color: shop.color, border: `1px solid ${shop.border}`,
      letterSpacing: '0.05em',
    }}>
      {shop.label}
    </span>
  );
};

// ── Color / Qty picker modal ───────────────────────────────────────────────
const AddToCartModal = ({ item, onAdd, onClose }) => {
  const colours = item.colours?.length > 0 ? item.colours : ['General'];
  const [selected, setSelected] = useState({});
  const [type, setType] = useState('sale');
  const shop = SHOPS[item.source];

  const total = Object.values(selected).reduce((s, q) => s + q, 0);

  const step = (colour, delta) => {
    setSelected(prev => {
      const cur = prev[colour] || 0;
      const next = Math.max(0, cur + delta);
      const upd = { ...prev };
      if (next === 0) delete upd[colour]; else upd[colour] = next;
      return upd;
    });
  };

  const handleAdd = () => {
    if (total === 0) return;
    Object.entries(selected).forEach(([colour, qty]) => {
      onAdd({ productCode: item.productCode, name: item.name, colour, rate: item.rate, qty, type, images: item.images, source: item.source });
    });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ width: '100%', background: 'var(--secondary-bg)', borderRadius: '20px 20px 0 0', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>#{item.productCode}</div>
              {item.source && <SourceBadge source={item.source} />}
            </div>
            <div style={{ fontWeight: '800', fontSize: '1rem', color: 'white' }}>{item.name !== item.productCode ? item.name : item.productCode}</div>
            {item.rate > 0 && <div style={{ color: shop?.color || '#a5b4fc', fontWeight: '700', marginTop: '2px' }}>₹{item.rate.toLocaleString('en-IN')}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Type selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
          {[['sale', '🛒 Sale'], ['interest', '❤️ Interest']].map(([t, label]) => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, padding: '10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', border: 'none',
              background: type === t ? (t === 'sale' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'rgba(255,255,255,0.06)',
              color: type === t ? (t === 'sale' ? '#10b981' : '#f87171') : 'var(--text-muted)',
            }}>{label}</button>
          ))}
        </div>

        {/* Colour + qty rows */}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.06em' }}>
          SELECT COLOURS & QTY
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '22px' }}>
          {colours.map(c => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '12px', background: selected[c] ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selected[c] ? 'rgba(99,102,241,0.35)' : 'var(--glass-border)'}`, transition: 'all 0.15s' }}>
              <span style={{ fontWeight: '600', color: selected[c] ? '#c7d2fe' : 'var(--text-muted)', fontSize: '0.9rem' }}>{c}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => step(c, -1)} style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Minus size={14} />
                </button>
                <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: '700', fontSize: '1rem', color: selected[c] ? '#c7d2fe' : 'var(--text-muted)' }}>
                  {selected[c] || 0}
                </span>
                <button onClick={() => step(c, 1)} style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(99,102,241,0.3)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleAdd} disabled={total === 0} style={{
          width: '100%', padding: '15px', borderRadius: '14px', fontSize: '0.95rem', fontWeight: '700', border: 'none', cursor: total === 0 ? 'not-allowed' : 'pointer',
          background: total === 0 ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          color: total === 0 ? 'var(--text-muted)' : 'white',
        }}>
          {total === 0 ? 'Select qty to add' : `Add ${total} pcs to Cart`}
        </button>
      </div>
    </div>
  );
};

// ── ProductCard ────────────────────────────────────────────────────────────
const ProductCard = ({ item, activeApiUrl, onRemove, isRemoving, onAddToCart, cartQty }) => {
  const [expanded, setExpanded] = useState(false);
  const images = item.images || [];
  const mainImg = images[0] ? getAbsoluteImageUrl(images[0], activeApiUrl, 300) : null;
  const shop = SHOPS[item.source];

  return (
    <div style={{
      background: 'var(--secondary-bg)', borderRadius: '14px', overflow: 'hidden',
      border: cartQty > 0 ? '2px solid #6366f1' : (item.catalogueMatched ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(245,158,11,0.3)'),
      position: 'relative',
    }}>
      {/* Image */}
      <div style={{ width: '100%', height: '150px', background: 'rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden' }}>
        {mainImg ? (
          <AuthImage src={mainImg} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fallback={<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.15 }}><ImageIcon size={36} /></div>} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.15 }}><Package size={36} /></div>
        )}
        {cartQty > 0 && (
          <div style={{ position: 'absolute', top: 6, right: 6, background: '#6366f1', color: 'white', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', fontWeight: '800' }}>
            {cartQty} in cart
          </div>
        )}
        {item.source && (
          <div style={{ position: 'absolute', top: 6, left: 6 }}>
            <SourceBadge source={item.source} />
          </div>
        )}
        {onRemove && !item.source && (
          <button onClick={() => !isRemoving && onRemove(item.productCode)} disabled={isRemoving}
            style={{ position: 'absolute', top: 6, left: 6, background: isRemoving ? 'rgba(100,100,100,0.85)' : 'rgba(239,68,68,0.85)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isRemoving ? 'not-allowed' : 'pointer' }}>
            {isRemoving ? <Loader2 size={12} color="white" className="spinner" /> : <X size={13} color="white" />}
          </button>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>#{item.productCode}</div>
            {item.name !== item.productCode && <div style={{ fontWeight: '700', fontSize: '0.85rem', color: 'white', lineHeight: 1.2 }}>{item.name}</div>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
            {item.rate > 0 && <div style={{ fontSize: '0.95rem', fontWeight: '800', color: shop?.color || '#a5b4fc' }}>₹{item.rate.toLocaleString('en-IN')}</div>}
            {item.stock != null && <div style={{ fontSize: '0.65rem', color: item.stock < 10 ? '#ef4444' : 'var(--text-muted)' }}>{item.stock} pcs</div>}
          </div>
        </div>

        {item.colours?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '6px' }}>
            {(expanded ? item.colours : item.colours.slice(0, 3)).map(c => <ColourChip key={c} colour={c} />)}
            {item.colours.length > 3 && (
              <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', color: '#a5b4fc', fontSize: '0.65rem', cursor: 'pointer', padding: '3px 4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                {expanded ? <><ChevronUp size={10} />Less</> : <><ChevronDown size={10} />+{item.colours.length - 3}</>}
              </button>
            )}
          </div>
        )}

        {onAddToCart && (
          <button onClick={() => onAddToCart(item)} style={{
            width: '100%', padding: '8px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700', border: 'none', cursor: 'pointer',
            background: cartQty > 0 ? 'rgba(99,102,241,0.2)' : `linear-gradient(135deg,${shop?.color || '#6366f1'},${shop?.color || '#8b5cf6'})`,
            color: cartQty > 0 ? '#a5b4fc' : 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <Plus size={14} /> Add to Cart
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main ExhibitionSection ─────────────────────────────────────────────────
const ExhibitionSection = ({ products = [], activeApiUrl, staffName = '', onBack }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | preview | customer | order-review
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [removingCode, setRemovingCode] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // Shop section state
  const [activeShop, setActiveShop] = useState('srs');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Order flow state
  const [cart, setCart] = useState([]);
  const [pickingProduct, setPickingProduct] = useState(null);
  const [customer, setCustomer] = useState({ name: '', contact: '', address: '', gst: '' });
  const [showOCR, setShowOCR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderDone, setOrderDone] = useState(false);
  const scanProcessing = useRef(false);

  useEffect(() => {
    fetchExhibition()
      .then(setItems)
      .catch(() => setError('Could not load exhibition data'))
      .finally(() => setLoading(false));

    // Auto-sync any pending offline orders on mount
    const autoSync = async () => {
      try {
        const { value } = await Preferences.get({ key: 'exhb_offline_orders' });
        if (!value) return;
        const queue = JSON.parse(value);
        const pending = queue.filter(o => !o.permanentlyFailed);
        if (pending.length === 0) return;

        const baseUrl = await getBaseUrl();
        const headers = await getAuthHeaders();
        const remaining = [...queue.filter(o => o.permanentlyFailed)];

        for (const order of pending) {
          try {
            const res = await fetch(`${baseUrl}/api/sales/save-order`, { method: 'POST', headers, body: JSON.stringify(order) });
            if (!res.ok) {
              const retryCount = (order.retryCount || 0) + 1;
              remaining.push({ ...order, retryCount, permanentlyFailed: res.status < 500 || retryCount >= 3 });
            }
          } catch {
            const retryCount = (order.retryCount || 0) + 1;
            remaining.push({ ...order, retryCount, permanentlyFailed: retryCount >= 3 });
          }
        }
        await Preferences.set({ key: 'exhb_offline_orders', value: JSON.stringify(remaining) });
      } catch {}
    };
    setTimeout(autoSync, 5000);
  }, []);

  // Persist cart to Preferences on change (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await Preferences.set({ key: 'exhb_cart', value: JSON.stringify(cart) });
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [cart]);

  // Restore cart from Preferences on mount
  useEffect(() => {
    Preferences.get({ key: 'exhb_cart' }).then(({ value }) => {
      if (value) {
        try { setCart(JSON.parse(value)); } catch {}
      }
    }).catch(() => {});
  }, []);

  // Reset search on shop switch
  useEffect(() => { setCatalogSearch(''); }, [activeShop]);

  // ── Catalog groups for active shop (search results) ──────────────────────
  const catalogGroups = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return [];

    const shopProducts = products.filter(p => p.source === activeShop);
    const groups = {};

    shopProducts.forEach(p => {
      const key = String(p.id || p.name).trim();
      if (!key) return;
      if (!groups[key]) {
        groups[key] = {
          productCode: key,
          name: p.name || key,
          colours: [],
          rate: p.rate || 0,
          images: [],
          source: activeShop,
          catalogueMatched: true,
        };
      }
      const g = groups[key];
      if (p.color && p.color !== 'General' && !g.colours.includes(p.color)) g.colours.push(p.color);
      if (p.imageUrl && !g.images.includes(p.imageUrl)) g.images.push(p.imageUrl);
      if (!g.rate && p.rate) g.rate = p.rate;
    });

    return Object.values(groups)
      .filter(g => g.productCode.toLowerCase().includes(query) || g.name.toLowerCase().includes(query))
      .slice(0, 30);
  }, [products, activeShop, catalogSearch]);

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const cartTotal = cart.reduce((s, i) => s + i.rate * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const addToCart = (item) => setPickingProduct(item);

  const handleAddFromPicker = (lineItem) => {
    setCart(prev => [...prev, {
      ...lineItem,
      source: pickingProduct?.source || activeShop,
      scannedUid: pickingProduct?.scannedUid || null,
      cartId: Date.now() + Math.random(),
    }]);
  };

  const removeFromCart = (cartId) => setCart(prev => prev.filter(i => i.cartId !== cartId));

  const getCartQtyForProduct = (productCode) =>
    cart.filter(i => i.productCode === productCode).reduce((s, i) => s + i.qty, 0);

  // Customer OCR
  const handleCustomerExtract = (data) => {
    setCustomer(prev => ({ ...prev, ...data }));
    setShowOCR(false);
  };

  // ── Barcode scan → searches BOTH shops, auto-switches tab ──────────────────
  const handleBarcodeScan = async (uid, getSnapshot) => {
    if (scanProcessing.current) return;
    scanProcessing.current = true;
    setScanError('');

    // Build a catalog result object from a product hit + its full design variants
    const buildResult = (hit, source) => {
      const pool = products.filter(p => p.source === source);
      const variants = pool.filter(p => p.id === hit.id);
      const colours = [...new Set(variants.map(p => p.color).filter(c => c && c !== 'General'))];
      return {
        productCode: hit.id,
        name: hit.name,
        colours: colours.length ? colours : ['General'],
        rate: hit.rate,
        images: hit.imageUrl ? [hit.imageUrl] : [],
        source,
        scannedUid: uid,
        catalogueMatched: true,
      };
    };

    // Try any shop's catalog (active shop first, then the other)
    const findInAnyCatalog = (barcode) => {
      const shopOrder = activeShop === 'srs' ? ['srs', 'radhika'] : ['radhika', 'srs'];
      for (const shop of shopOrder) {
        const prefix = shop === 'srs' ? 'srs_' : 'rad_';
        const hit = products.find(p =>
          p.source === shop && (
            (Array.isArray(p.barcodes) && p.barcodes.includes(barcode)) ||
            p.uid === barcode ||
            p.uid === prefix + barcode
          )
        );
        if (hit) return { result: buildResult(hit, shop), shop };
      }
      return null;
    };

    const findInExhibition = (code) =>
      items.find(item =>
        String(item.productCode).trim() === String(code).trim() ||
        (Array.isArray(item.uids) && item.uids.some(u => u === String(code).trim()))
      );

    // 1. Catalog lookup (both shops, active shop first)
    let catalogHit = findInAnyCatalog(uid);
    let found = catalogHit?.result || null;
    if (catalogHit?.shop && catalogHit.shop !== activeShop) {
      setActiveShop(catalogHit.shop); // auto-switch tab to the correct shop
    }

    // 2. Exhibition list fallback
    if (!found) found = findInExhibition(uid);

    // 3. OCR fallback on label image
    if (!found && getSnapshot) {
      try {
        const snapshot = await getSnapshot();
        if (snapshot) {
          const base64 = snapshot.replace(/^data:image\/\w+;base64,/, '');
          const tmpFile = `ocr_exhb_${Date.now()}.jpg`;
          await Filesystem.writeFile({ path: tmpFile, data: base64, directory: Directory.Cache });
          try {
            const { uri } = await Filesystem.getUri({ path: tmpFile, directory: Directory.Cache });
            const { textDetections } = await Ocr.detectText({ filename: uri });
            const ocrText = (textDetections || []).map(d => d.text.trim()).join(' ');
            const tokens = ocrText.match(/\d+/g) || [];
            const sevenDigit = tokens.find(t => t.length === 7);
            if (sevenDigit) {
              const parsedCode = sevenDigit.substring(2, sevenDigit.length - 1);
              const ocrCatalogHit = findInAnyCatalog(parsedCode);
              if (ocrCatalogHit) {
                found = ocrCatalogHit.result;
                if (ocrCatalogHit.shop !== activeShop) setActiveShop(ocrCatalogHit.shop);
              } else {
                found = findInExhibition(parsedCode);
              }
            }
            if (!found) {
              for (const t of tokens) {
                if (t.length >= 4 && t.length <= 6) {
                  const ocrCatalogHit2 = findInAnyCatalog(t);
                  if (ocrCatalogHit2) {
                    found = ocrCatalogHit2.result;
                    if (ocrCatalogHit2.shop !== activeShop) setActiveShop(ocrCatalogHit2.shop);
                    break;
                  }
                  found = findInExhibition(t);
                  if (found) break;
                }
              }
            }
          } finally {
            Filesystem.deleteFile({ path: tmpFile, directory: Directory.Cache }).catch(() => {});
          }
        }
      } catch {}
    }

    setShowScanner(false);
    scanProcessing.current = false;

    if (found) {
      if (found.source) {
        // Catalog hit — open picker directly with source tag
        setPickingProduct(found);
      } else {
        // Exhibition item — auto-save UID behavior
        if (!found.uids?.includes(uid)) {
          const updatedItems = items.map(i =>
            i.productCode === found.productCode
              ? { ...i, uids: [...(i.uids || []), uid] }
              : i
          );
          setItems(updatedItems);
          saveExhibitionItems(updatedItems).catch(() => {});
          setPickingProduct({ ...found, uids: [...(found.uids || []), uid], scannedUid: uid });
        } else {
          setPickingProduct({ ...found, scannedUid: uid });
        }
      }
    } else {
      setScanError(`Barcode "${uid}" not found in SRS or Radhika catalog`);
      setTimeout(() => setScanError(''), 5000);
    }
  };

  // ── Save order (with offline fallback) ────────────────────────────────────
  const handleSaveOrder = async () => {
    setOrderSaving(true);
    const orderCart = cart.map(i => ({
      uid: i.scannedUid || `EXHB-${i.productCode}-${i.colour || i.color}`,
      id: i.productCode,
      name: i.name,
      color: i.colour || i.color,
      rate: i.rate,
      qty: i.qty,
      type: i.type || 'sale',
      source: i.source || null,
      cartId: i.cartId,
    }));
    const payload = { customer, cart: orderCart, createdBy: staffName || 'Exhibition' };

    try {
      const baseUrl = await getBaseUrl();
      const headers = await getAuthHeaders();
      const res = await fetch(`${baseUrl}/api/sales/save-order`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      setOrderDone(true);
      Preferences.remove({ key: 'exhb_cart' }).catch(() => {});
      setTimeout(() => {
        setCart([]);
        setCustomer({ name: '', contact: '', address: '', gst: '' });
        setView('list');
        setOrderDone(false);
      }, 2000);
    } catch {
      // Network failure — queue offline, notify user
      try {
        const { value } = await Preferences.get({ key: 'exhb_offline_orders' });
        const queue = value ? JSON.parse(value) : [];
        queue.push({ ...payload, queuedAt: Date.now(), orderId: `EXHB-OFFLINE-${Date.now()}` });
        await Preferences.set({ key: 'exhb_offline_orders', value: JSON.stringify(queue) });
        setError(`No connection — order saved offline (${queue.length} pending). Will sync when back online.`);
        setOrderDone(true);
        setTimeout(() => {
          setCart([]);
          setCustomer({ name: '', contact: '', address: '', gst: '' });
          setView('list');
          setOrderDone(false);
        }, 2500);
      } catch {
        setError('Order save failed and could not be queued offline. Try again.');
        setView('order-review');
      }
    } finally {
      setOrderSaving(false);
    }
  };

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { setError('Excel file is empty'); return; }
      const matched = matchWithCatalogue(rows, products);
      if (!matched.length) { setError('No valid rows found — check column names'); return; }
      setPreview({ rows: matched, matchedCount: matched.filter(r => r.catalogueMatched).length, unmatchedCount: matched.filter(r => !r.catalogueMatched).length });
      setView('preview');
    } catch { setError('Failed to read file. Please use the template format.'); }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setSaving(true); setError('');
    try {
      await saveExhibitionItems(preview.rows);
      const updated = await fetchExhibition();
      setItems(updated); setPreview(null); setView('list');
    } catch { setError('Failed to save. Check connection.'); }
    finally { setSaving(false); }
  };

  const handleClear = async () => {
    setShowClearConfirm(false); setClearing(true);
    try { await clearExhibition(); setItems([]); }
    catch { setError('Clear failed.'); }
    finally { setClearing(false); }
  };

  const handleRemoveItem = async (productCode) => {
    setRemovingCode(productCode);
    const updated = items.filter(i => i.productCode !== productCode);
    try {
      if (updated.length > 0) {
        await saveExhibitionItems(updated);
      } else {
        await clearExhibition();
      }
      setItems(updated);
    } catch { setError('Remove failed.'); }
    finally { setRemovingCode(null); }
  };

  // ── ORDER REVIEW VIEW ──────────────────────────────────────────────────────
  if (view === 'order-review') {
    const saleItems     = cart.filter(i => i.type === 'sale');
    const interestItems = cart.filter(i => i.type === 'interest');
    const saleTotal     = saleItems.reduce((s, i) => s + i.rate * i.qty, 0);

    // Group sale items by shop
    const srsSale     = saleItems.filter(i => i.source === 'srs');
    const radhikaSale = saleItems.filter(i => i.source === 'radhika');
    const otherSale   = saleItems.filter(i => !i.source);

    const renderSaleGroup = (label, groupItems, color) => groupItems.length === 0 ? null : (
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: '700', marginBottom: '8px', color }}>
          {label} ({groupItems.length} items)
        </div>
        {groupItems.map((item, i) => (
          <div key={item.cartId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < groupItems.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: '0.88rem' }}>
            <span>{item.name} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>({item.colour})</span></span>
            <span>{item.qty} × ₹{item.rate} = <strong>₹{item.rate * item.qty}</strong></span>
          </div>
        ))}
      </div>
    );

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--primary-bg)', zIndex: 200, display: 'flex', flexDirection: 'column', color: 'white' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setView('customer')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ArrowLeft size={22} />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Order Review</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* Customer */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px' }}>CUSTOMER</div>
            <div style={{ fontWeight: '700' }}>{customer.name || 'Walk-in Customer'}</div>
            {customer.contact && <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{customer.contact}</div>}
            {customer.address && <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{customer.address}</div>}
          </div>

          {/* Sale items grouped by shop */}
          {saleItems.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: '700', marginBottom: '12px' }}>SALE ITEMS ({saleItems.length})</div>
              {renderSaleGroup('SRS', srsSale, SHOPS.srs.color)}
              {renderSaleGroup('Radhika', radhikaSale, SHOPS.radhika.color)}
              {renderSaleGroup('Other', otherSale, '#a5b4fc')}
            </div>
          )}

          {/* Interest items */}
          {interestItems.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.7rem', color: '#f472b6', fontWeight: '700', marginBottom: '8px' }}>INTEREST ({interestItems.length})</div>
              {interestItems.map((item, i) => (
                <div key={item.cartId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < interestItems.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: '0.88rem', opacity: 0.75 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{item.name} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>({item.colour})</span></span>
                    {item.source && <SourceBadge source={item.source} />}
                  </div>
                  <span>{item.qty} pcs</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: '800' }}>
              <span>Total (Sales)</span>
              <span style={{ color: '#a5b4fc' }}>₹{saleTotal.toLocaleString('en-IN')}</span>
            </div>
            {srsSale.length > 0 && radhikaSale.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                <span style={{ color: SHOPS.srs.color }}>SRS: ₹{srsSale.reduce((s, i) => s + i.rate * i.qty, 0).toLocaleString('en-IN')}</span>
                <span style={{ color: SHOPS.radhika.color }}>Radhika: ₹{radhikaSale.reduce((s, i) => s + i.rate * i.qty, 0).toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '16px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '12px' }}>
          <button onClick={() => setView('customer')} style={{ flex: 1, padding: '15px', borderRadius: '12px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontWeight: '600' }}>
            Edit
          </button>
          <button onClick={handleSaveOrder} disabled={orderSaving || orderDone} style={{ flex: 2, padding: '15px', borderRadius: '12px', background: orderDone ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', color: 'white', fontWeight: '700', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {orderDone ? <><CheckCircle size={18} /> Order Saved!</> : orderSaving ? <><Loader2 size={18} className="spinner" /> Saving...</> : '✓ Save Order'}
          </button>
        </div>
      </div>
    );
  }

  // ── CUSTOMER VIEW ──────────────────────────────────────────────────────────
  if (view === 'customer') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--primary-bg)', zIndex: 200, display: 'flex', flexDirection: 'column', color: 'white' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ArrowLeft size={22} />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Customer Details</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <button
            onClick={() => setShowOCR(true)}
            style={{ width: '100%', padding: '16px', borderRadius: '14px', marginBottom: '20px', background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.15))', border: '1px solid rgba(99,102,241,0.35)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontWeight: '700', fontSize: '0.95rem' }}
          >
            <CreditCard size={20} color="#a5b4fc" />
            Scan Customer Card (Auto-fill)
          </button>

          {[
            { key: 'name', label: 'Customer Name *', placeholder: 'Enter name', icon: <User size={16} /> },
            { key: 'contact', label: 'Contact', placeholder: '9876543210' },
            { key: 'address', label: 'Address', placeholder: 'City / Address' },
            { key: 'gst', label: 'GST Number', placeholder: 'Optional' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>{label}</label>
              <input
                value={customer[key]}
                onChange={e => setCustomer(p => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{ width: '100%', padding: '13px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', color: 'white', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
          ))}

          {/* Cart summary with shop breakdown */}
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '14px', marginTop: '8px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>CART SUMMARY</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '6px' }}>
              <span>{cartCount} pcs, {cart.length} line items</span>
              <span style={{ fontWeight: '800', color: '#a5b4fc' }}>₹{cartTotal.toLocaleString('en-IN')}</span>
            </div>
            {/* Shop breakdown */}
            {['srs', 'radhika'].map(shop => {
              const shopCart = cart.filter(i => i.source === shop && i.type === 'sale');
              if (shopCart.length === 0) return null;
              const shopTotal = shopCart.reduce((s, i) => s + i.rate * i.qty, 0);
              return (
                <div key={shop} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', opacity: 0.7 }}>
                  <span style={{ color: SHOPS[shop].color }}>{SHOPS[shop].label}: {shopCart.length} items</span>
                  <span>₹{shopTotal.toLocaleString('en-IN')}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid var(--glass-border)' }}>
          <button
            onClick={() => setView('order-review')}
            disabled={cart.length === 0}
            style={{ width: '100%', padding: '16px', borderRadius: '14px', background: cart.length === 0 ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', color: cart.length === 0 ? 'var(--text-muted)' : 'white', fontWeight: '800', fontSize: '1rem', cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            Review Order →
          </button>
        </div>

        {showOCR && <OCRScanner onExtract={handleCustomerExtract} onClose={() => setShowOCR(false)} />}
      </div>
    );
  }

  // ── PREVIEW VIEW ────────────────────────────────────────────────────────────
  if (view === 'preview' && preview) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--primary-bg)' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => { setView('list'); setPreview(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><ArrowLeft size={22} /></button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>Preview — {preview.rows.length} products</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span style={{ color: '#a5b4fc' }}>{preview.matchedCount} catalogue match</span>
              {preview.unmatchedCount > 0 && <span style={{ color: '#f59e0b', marginLeft: '8px' }}>{preview.unmatchedCount} unmatched</span>}
            </p>
          </div>
        </div>
        {error && <div style={{ margin: '12px 16px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={16} /> {error}</div>}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {preview.rows.map(item => <ProductCard key={item.productCode} item={item} activeApiUrl={activeApiUrl} />)}
        </div>
        <div style={{ padding: '16px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '12px' }}>
          <button onClick={() => { setView('list'); setPreview(null); }} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.07)', border: 'none', color: 'white', fontWeight: '600' }}>Cancel</button>
          <button onClick={handleConfirm} disabled={saving} style={{ flex: 2, padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', color: 'white', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {saving ? <><Loader2 size={18} className="spinner" /> Saving...</> : <><CheckCircle size={18} /> Save {preview.rows.length} Products</>}
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN LIST VIEW ──────────────────────────────────────────────────────────
  const shopProductCount = products.filter(p => p.source === activeShop).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--primary-bg)' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><ArrowLeft size={22} /></button>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'white' }}>Exhibition</h2>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {SHOPS[activeShop].label}: {shopProductCount.toLocaleString()} products
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => { scanProcessing.current = false; setShowScanner(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '10px', background: SHOPS[activeShop].bg, border: `1px solid ${SHOPS[activeShop].border}`, color: SHOPS[activeShop].color, fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}
            >
              <Scan size={15} /> Scan
            </button>
            <button onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>
              <FileDown size={15} />
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '10px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}>
              <Upload size={15} /> Upload
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Shop tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {Object.entries(SHOPS).map(([shop, cfg]) => (
            <button
              key={shop}
              onClick={() => setActiveShop(shop)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '10px', border: 'none', fontWeight: '700',
                fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.15s',
                background: activeShop === shop ? cfg.bg : 'rgba(255,255,255,0.04)',
                color: activeShop === shop ? cfg.color : 'var(--text-muted)',
                borderBottom: `2px solid ${activeShop === shop ? cfg.color : 'transparent'}`,
              }}
            >
              {cfg.label}
              {cart.filter(i => i.source === shop).length > 0 && (
                <span style={{
                  marginLeft: '6px', background: cfg.color, color: 'white',
                  fontSize: '0.6rem', padding: '1px 5px', borderRadius: '8px', fontWeight: '800',
                }}>
                  {cart.filter(i => i.source === shop).reduce((s, i) => s + i.qty, 0)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Catalog search */}
        <div style={{ position: 'relative', marginTop: '12px' }}>
          <input
            type="text"
            value={catalogSearch}
            onChange={e => setCatalogSearch(e.target.value)}
            placeholder={`Search ${SHOPS[activeShop].label} by design code...`}
            style={{
              width: '100%', padding: '11px 12px 11px 38px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.05)', border: `1px solid ${SHOPS[activeShop].border}`,
              color: 'white', fontSize: '0.88rem', outline: 'none',
            }}
          />
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: SHOPS[activeShop].color, opacity: 0.7 }} />
          {catalogSearch && (
            <button onClick={() => setCatalogSearch('')} style={{ position: 'absolute', right: '10px', top: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Error banners */}
      {error && (
        <div style={{ margin: '10px 16px 0', padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
      {scanError && (
        <div style={{ margin: '8px 16px 0', padding: '10px 14px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', color: '#fbbf24', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={15} /> {scanError}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={32} className="spinner" />
        </div>
      ) : catalogGroups.length > 0 ? (
        // ── Catalog search results ──────────────────────────────────────────
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px', paddingBottom: cartCount > 0 ? '90px' : '16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
            {catalogGroups.length} result{catalogGroups.length !== 1 ? 's' : ''} in {SHOPS[activeShop].label} catalog
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {catalogGroups.map(item => (
              <ProductCard
                key={item.productCode}
                item={item}
                activeApiUrl={activeApiUrl}
                onAddToCart={addToCart}
                cartQty={getCartQtyForProduct(item.productCode)}
              />
            ))}
          </div>
        </div>
      ) : catalogSearch.trim() && catalogGroups.length === 0 ? (
        // ── No search results ───────────────────────────────────────────────
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
          <Package size={40} style={{ opacity: 0.2, marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No {SHOPS[activeShop].label} product found for "{catalogSearch}"
          </p>
          <button onClick={() => setActiveShop(activeShop === 'srs' ? 'radhika' : 'srs')} style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '10px', background: SHOPS[activeShop === 'srs' ? 'radhika' : 'srs'].bg, border: `1px solid ${SHOPS[activeShop === 'srs' ? 'radhika' : 'srs'].border}`, color: SHOPS[activeShop === 'srs' ? 'radhika' : 'srs'].color, fontWeight: '700', cursor: 'pointer', fontSize: '0.8rem' }}>
            Try {activeShop === 'srs' ? 'Radhika' : 'SRS'} catalog
          </button>
        </div>
      ) : items.length === 0 ? (
        // ── Empty exhibition ────────────────────────────────────────────────
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: SHOPS[activeShop].bg, border: `1px dashed ${SHOPS[activeShop].border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <Scan size={32} color={SHOPS[activeShop].color} style={{ opacity: 0.6 }} />
          </div>
          <h3 style={{ color: 'white', marginBottom: '8px' }}>Scan or Search</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '280px', lineHeight: 1.5, marginBottom: '24px' }}>
            Use the search bar or scan a barcode to find {SHOPS[activeShop].label} products. You can add items from both shops to the same cart.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => { scanProcessing.current = false; setShowScanner(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', borderRadius: '12px', background: SHOPS[activeShop].bg, border: `1px solid ${SHOPS[activeShop].border}`, color: SHOPS[activeShop].color, fontWeight: '700', cursor: 'pointer' }}
            >
              <Scan size={16} /> Scan Barcode
            </button>
            <button onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', borderRadius: '12px', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--glass-border)', color: 'white', fontWeight: '600', cursor: 'pointer' }}>
              <FileDown size={16} /> Template
            </button>
          </div>
        </div>
      ) : (
        // ── Exhibition items (from Excel upload) ───────────────────────────
        <>
          <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--glass-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span style={{ color: '#a5b4fc', fontWeight: '700' }}>{items.filter(i => i.catalogueMatched).length}</span> catalogue •{' '}
              <span style={{ color: '#f59e0b', fontWeight: '700' }}>{items.filter(i => !i.catalogueMatched).length}</span> manual
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {showClearConfirm ? (
                <>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Clear all?</span>
                  <button onClick={handleClear} disabled={clearing} style={{ padding: '4px 10px', borderRadius: '8px', background: 'rgba(239,68,68,0.85)', border: 'none', color: 'white', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}>
                    {clearing ? <Loader2 size={11} className="spinner" /> : 'Yes'}
                  </button>
                  <button onClick={() => setShowClearConfirm(false)} style={{ padding: '4px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', fontSize: '0.72rem', cursor: 'pointer' }}>No</button>
                </>
              ) : (
                <button onClick={() => setShowClearConfirm(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: 'rgba(239,68,68,0.7)', fontSize: '0.75rem', cursor: 'pointer' }}>
                  <Trash2 size={13} /> Clear All
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingBottom: cartCount > 0 ? '90px' : '16px' }}>
            {items.map(item => (
              <ProductCard
                key={item.productCode}
                item={item}
                activeApiUrl={activeApiUrl}
                onRemove={handleRemoveItem}
                isRemoving={removingCode === item.productCode}
                onAddToCart={addToCart}
                cartQty={getCartQtyForProduct(item.productCode)}
              />
            ))}
          </div>
        </>
      )}

      {/* Floating cart button */}
      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px', background: 'linear-gradient(0deg, rgba(10,15,30,0.98) 70%, transparent)', zIndex: 100 }}>
          <button
            onClick={() => setView('customer')}
            style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', color: 'white', fontWeight: '800', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 8px 30px -6px rgba(99,102,241,0.6)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShoppingCart size={20} />
              <span>{cartCount} pcs · {cart.length} items</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {['srs', 'radhika'].map(shop => {
                const shopCount = cart.filter(i => i.source === shop).reduce((s, i) => s + i.qty, 0);
                if (!shopCount) return null;
                return (
                  <span key={shop} style={{ fontSize: '0.65rem', background: SHOPS[shop].bg, border: `1px solid ${SHOPS[shop].border}`, color: SHOPS[shop].color, padding: '2px 6px', borderRadius: '6px', fontWeight: '800' }}>
                    {SHOPS[shop].label} {shopCount}
                  </span>
                );
              })}
              <span>₹{cartTotal.toLocaleString('en-IN')} →</span>
            </div>
          </button>
        </div>
      )}

      {/* Barcode scanner */}
      {showScanner && (
        <QRScanner
          onScan={handleBarcodeScan}
          onClose={() => { setShowScanner(false); scanProcessing.current = false; }}
        />
      )}

      {/* Color/Qty picker modal */}
      {pickingProduct && (
        <AddToCartModal
          item={pickingProduct}
          onAdd={handleAddFromPicker}
          onClose={() => setPickingProduct(null)}
        />
      )}
    </div>
  );
};

export default ExhibitionSection;
