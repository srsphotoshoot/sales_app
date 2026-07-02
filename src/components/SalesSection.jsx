import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, RefreshCw, WifiOff, History, X, Edit3, ShoppingCart, Plus, Minus, Check } from 'lucide-react';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Ocr } from '@capacitor-community/image-to-text';

// Services
import { getBaseUrl, getAbsoluteImageUrl, fetchCatalogProductById, linkBarcodeToProduct } from '../services/api.js';
import ProductUpdateModal from './ProductUpdateModal.jsx';

// Components
import OCRScanner from './OCRScanner.jsx';
import QRScanner from './QRScanner.jsx';
import NewProductRegistry from './NewProductRegistry.jsx';
import BrandedShareModal from './BrandedShareModal.jsx';

// Sub-components
import CustomerScannerSelection from './sales/CustomerScannerSelection.jsx';
import CustomerDetailsForm from './sales/CustomerDetailsForm.jsx';
import OrderBuilder from './sales/OrderBuilder.jsx';
import ColorSelectionModal from './sales/ColorSelectionModal.jsx';
import UserOrderHistory from './UserOrderHistory.jsx';

// ── Scanned Product Action Sheet ───────────────────────────────────────────
function ScannedProductActionSheet({ product, onAddToOrder, onUpdate, onClose }) {
  const colors = product.color
    ? product.color.split(',').map(c => c.trim()).filter(Boolean)
    : (Array.isArray(product.colors) ? product.colors : []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ width: '100%', background: 'var(--secondary-bg)', borderRadius: '20px 20px 0 0', padding: '24px', paddingBottom: '36px' }} onClick={e => e.stopPropagation()}>
        {/* Handle bar */}
        <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', margin: '0 auto 20px' }} />

        {/* Product info */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>Product Found</p>
          <p style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '4px' }}>{product.name}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-new)', fontWeight: '700' }}>₹{product.rate}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {product.id}</span>
            {colors.length > 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{colors.join(', ')}</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={onAddToOrder}
            style={{ width: '100%', padding: '15px', borderRadius: '14px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--accent-new)', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <ShoppingCart size={20} /> Add to Order
          </button>
          <button
            onClick={onUpdate}
            style={{ width: '100%', padding: '15px', borderRadius: '14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <Edit3 size={20} /> Update Product
          </button>
          <button
            onClick={onClose}
            style={{ width: '100%', padding: '13px', borderRadius: '14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


const SalesSection = ({ products, onRefresh, activeApiUrl, onBack, branding: globalBranding, staffName, catalogItem, onCatalogItemConsumed }) => {
  const [step, setStep] = useState('scan-card');
  const [showHistory, setShowHistory] = useState(false);
  const [showOrderReview, setShowOrderReview] = useState(false);
  const [customer, setCustomer] = useState({ name: '', gst: '', contact: '', address: '' });
  const [cart, setCart] = useState([]);
  const [activeScanner, setActiveScanner] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [offlineOrders, setOfflineOrders] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [recentItems, setRecentItems] = useState([]);
  const [isScannedFlash, setIsScannedFlash] = useState(false);
  const [branding, setBranding] = useState(globalBranding || { logoUrl: '', logoPosition: 'top-right' });
  const [selectedShareIds, setSelectedShareIds] = useState(new Set());
  const [showShareModal, setShowShareModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [pendingProductChoice, setPendingProductChoice] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [productToUpdate, setProductToUpdate] = useState(null);
  const [bulkSelections, setBulkSelections] = useState({});
  const [smartRegKey, setSmartRegKey] = useState(null);
  const [registrationData, setRegistrationData] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const isSyncInProgress = useRef(false);
  const isProcessingRef = useRef(false);
  const productsRef = useRef(products);
  const offlineOrdersRef = useRef(offlineOrders);
  useEffect(() => { offlineOrdersRef.current = offlineOrders; }, [offlineOrders]);
  const stepRef = useRef(step);

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => {
    stepRef.current = step;
    setSearchResults([]);
    setCustomerSearch('');
  }, [step]);

  useEffect(() => {
    const loadPersisted = async () => {
      try {
        const { value: cartVal } = await Preferences.get({ key: 'srs_pending_cart' });
        const { value: custVal } = await Preferences.get({ key: 'srs_pending_customer' });
        const { value: offlVal } = await Preferences.get({ key: 'srs_offline_orders' });
        const { value: recentVal } = await Preferences.get({ key: 'srs_recent_items' });

        if (cartVal) setCart(JSON.parse(cartVal));
        if (custVal) setCustomer(JSON.parse(custVal));
        if (recentVal) setRecentItems(JSON.parse(recentVal));
        if (offlVal) {
          const loaded = JSON.parse(offlVal);
          setOfflineOrders(loaded);
          // Auto-sync on startup if there are pending orders
          if (loaded.some(o => !o.permanentlyFailed)) {
            setTimeout(() => syncOfflineOrders(true), 3000);
          }
        }
      } catch (e) { console.error(e); }
    };
    loadPersisted();
  }, []);

  useEffect(() => {
    if (globalBranding && globalBranding.logoUrl) {
      setBranding(globalBranding);
    } else {
      loadBranding();
    }
  }, [globalBranding]);

  // Add catalog item directly to cart when received from CatalogSection
  useEffect(() => {
    if (!catalogItem) return;
    const { type, qty, ...productData } = catalogItem;
    setCart(prev => [...prev, {
      ...productData,
      type: type || 'sale',
      qty: qty || 1,
      cartId: Date.now() + Math.random(),
    }]);
    if (onCatalogItemConsumed) onCatalogItemConsumed();
  }, [catalogItem]);

  const loadBranding = async () => {
    try {
      const baseUrl = await getBaseUrl();
      const apiBase = baseUrl || import.meta.env.VITE_API_URL || '';
      const bRes = await fetch(`${apiBase}/api/admin/branding`, {
          headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (bRes.ok) setBranding(await bRes.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await Preferences.set({ key: 'srs_pending_cart', value: JSON.stringify(cart) });
        await Preferences.set({ key: 'srs_pending_customer', value: JSON.stringify(customer) });
        await Preferences.set({ key: 'srs_offline_orders', value: JSON.stringify(offlineOrders) });
      } catch (e) { console.error(e); }
    }, 500);
    return () => clearTimeout(timer);
  }, [cart, customer, offlineOrders]);

  useEffect(() => {
    if (pendingProduct) {
      let colors = [];
      if (Array.isArray(pendingProduct.colors) && pendingProduct.colors.length > 0) {
        colors = pendingProduct.colors;
      } else if (pendingProduct.color && typeof pendingProduct.color === 'string') {
        colors = pendingProduct.color.split(',').map(c => c.trim()).filter(Boolean);
      }
      
      if (colors.length === 0) colors = ['General'];

      const initial = {};
      colors.forEach(c => initial[c] = { sale: 0, interest: 0 });
      setBulkSelections(initial);
    }
  }, [pendingProduct]);

  const handleCustomerExtract = (data) => {
    setCustomer(prev => ({ ...prev, ...data }));
    setActiveScanner(null);
    setStep('edit-customer');
  };

  const searchCustomers = async (q) => {
    setCustomerSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const baseUrl = await getBaseUrl();
      const res = await fetch(`${baseUrl}/api/sales/customers/search?q=${encodeURIComponent(q)}`, {
        headers: { 'ngrok-skip-browser-warning': 'true', ...(await getAuthHeader()) }
      });
      if (res.ok) setSearchResults(await res.json());
    } catch (e) { console.error(e); }
  };

  const getAuthHeader = async () => {
    try {
      const { value: sessionData } = await Preferences.get({ key: 'auth_session' });
      if (sessionData) {
        const { token } = JSON.parse(sessionData);
        if (token) return { 'Authorization': `Bearer ${token}` };
      }
    } catch (e) {}
    return {};
  };

  const MAX_RETRIES = 3;

  const syncOfflineOrders = async (isAuto = false) => {
    const currentOrders = offlineOrdersRef.current;
    if (currentOrders.length === 0 || isSyncInProgress.current) return;
    isSyncInProgress.current = true;
    setIsSyncing(true);
    const syncable = currentOrders.filter(o => !o.permanentlyFailed);
    setSyncProgress({ done: 0, total: syncable.length });
    let successCount = 0;
    const remaining = [...currentOrders.filter(o => o.permanentlyFailed)]; // keep already-failed ones as-is
    const authHeader = await getAuthHeader();
    const baseUrl = await getBaseUrl();
    const apiBase = baseUrl || import.meta.env.VITE_API_URL || '';
    for (let i = 0; i < syncable.length; i++) {
      const order = syncable[i];
      try {
        const response = await fetch(`${apiBase}/api/sales/save-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', ...authHeader },
          body: JSON.stringify(order)
        });
        if (response.ok) {
          successCount++;
        } else {
          const retryCount = (order.retryCount || 0) + 1;
          // 4xx = bad data, won't fix with retry; 5xx = server issue, retry
          const is4xx = response.status >= 400 && response.status < 500;
          remaining.push({
            ...order,
            retryCount,
            lastError: `Server error ${response.status}`,
            permanentlyFailed: is4xx || retryCount >= MAX_RETRIES
          });
        }
      } catch (e) {
        const retryCount = (order.retryCount || 0) + 1;
        remaining.push({
          ...order,
          retryCount,
          lastError: 'Network error',
          permanentlyFailed: retryCount >= MAX_RETRIES
        });
      }
      setSyncProgress({ done: i + 1, total: syncable.length });
    }
    setOfflineOrders(remaining);
    setIsSyncing(false);
    setSyncProgress({ done: 0, total: 0 });
    isSyncInProgress.current = false;
    if (!isAuto) {
      const failedCount = remaining.filter(o => o.permanentlyFailed).length;
      if (successCount > 0 && failedCount === 0) showToast(`✅ ${successCount} order(s) synced successfully!`);
      else if (successCount > 0 && failedCount > 0) showToast(`✅ ${successCount} synced, ⚠️ ${failedCount} failed — contact admin.`);
      else if (successCount === 0 && remaining.length > 0) showToast('❌ Sync failed. Check your network connection.');
    }
  };

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      oscillator.connect(audioCtx.destination);
      oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
  };

  const handleAddProduct = useCallback(async (qrCodeValue, getSnapshot) => {
    if (isProcessingRef.current || stepRef.current !== 'add-products') return;
    isProcessingRef.current = true;
    
    // Find by UID, ID, Name, or any linked barcode
    const product = productsRef.current.find(p =>
      p.uid === qrCodeValue ||
      String(p.id) === String(qrCodeValue) ||
      (p.name && p.name.toLowerCase() === String(qrCodeValue).toLowerCase()) ||
      (Array.isArray(p.barcodes) && p.barcodes.includes(qrCodeValue))
    );

    if (product) {
      playBeep(); setIsScannedFlash(true); setTimeout(() => setIsScannedFlash(false), 200);
      // Auto-link this barcode if not already linked
      if (!product.barcodes?.includes(qrCodeValue) && product.uid !== qrCodeValue) {
        linkBarcodeToProduct(qrCodeValue, product.uid).catch(() => {});
      }
      setPendingProductChoice(product);
      setActiveScanner(null);
      isProcessingRef.current = false;
      return;
    }
    
    if (getSnapshot) {
      const snapshot = await getSnapshot();
      if (snapshot) {
        try {
          let ocrText = '';

          const base64Data = snapshot.replace(/^data:image\/\w+;base64,/, '');
          const tempFilename = `ocr_temp_${Date.now()}.jpg`;
          await Filesystem.writeFile({ path: tempFilename, data: base64Data, directory: Directory.Cache });
          try {
            const fileResult = await Filesystem.getUri({ path: tempFilename, directory: Directory.Cache });
            const { textDetections } = await Ocr.detectText({ filename: fileResult.uri });
            if (textDetections && textDetections.length > 0) {
              ocrText = textDetections.map(d => d.text.trim()).join(' ');
            }
          } finally {
            Filesystem.deleteFile({ path: tempFilename, directory: Directory.Cache }).catch(() => {});
          }

          const idMatch = ocrText.match(/(?:^|\D)(\d{4,6})(?:\D|$)/);
          if (idMatch) {
            const match = productsRef.current.find(p => String(p.id) === idMatch[1]);
            if (match) {
              linkBarcodeToProduct(qrCodeValue, match.uid).catch(() => {});
              setPendingProductChoice(match);
              setIsScannedFlash(true);
              setTimeout(() => setIsScannedFlash(false), 200);
              isProcessingRef.current = false;
              return;
            }
          }

          // 7-digit label format: first 2 digits + "95" = rate, chars [2:-1] = product code
          // Use token-based matching (not regex) to avoid false matches from 11-digit barcodes
          const numberTokens = ocrText.match(/\d+/g) || [];
          const sevenDigitToken = numberTokens.find(t => t.length === 7);
          if (sevenDigitToken) {
            const parsedId = sevenDigitToken.substring(2, sevenDigitToken.length - 1);
            const parsedRate = parseInt(sevenDigitToken.substring(0, 2) + '95');
            // If product already in inventory → auto-link barcode + show action choice
            const existingByParsedId = productsRef.current.find(p => String(p.id) === String(parsedId));
            if (existingByParsedId) {
              playBeep();
              linkBarcodeToProduct(qrCodeValue, existingByParsedId.uid).catch(() => {});
              setPendingProductChoice(existingByParsedId);
              setActiveScanner(null);
              isProcessingRef.current = false;
              return;
            }
            // New product — catalogue lookup for colours, then registration
            const catProduct = await fetchCatalogProductById(parsedId);
            const colors = catProduct?.variants
              ? [...new Set(catProduct.variants.map(v => v.color).filter(Boolean))]
              : [];
            setRegistrationData({ id: parsedId, name: parsedId, rate: parsedRate, qrKey: qrCodeValue, colors });
            setActiveScanner(null);
            isProcessingRef.current = false;
            return;
          }
        } catch (e) {}
      }
    }

    // Fallback: open registration with uid pre-filled, user fills remaining fields
    setRegistrationData({ id: '', name: '', rate: 1, qrKey: qrCodeValue });
    setActiveScanner(null);
    isProcessingRef.current = false;
  }, []);

  const addBulkToCart = () => {
    setCart(prev => {
      let newCart = [...prev];
      Object.entries(bulkSelections).forEach(([color, qtys]) => {
        ['sale', 'interest'].forEach(type => {
          if (qtys[type] > 0) {
            newCart.push({ ...pendingProduct, color, type, cartId: Date.now() + Math.random(), qty: qtys[type] });
          }
        });
      });
      return newCart;
    });
    setRecentItems(prev => [pendingProduct, ...prev.filter(i => i.uid !== pendingProduct.uid)].slice(0, 10));
    setPendingProduct(null);
    setTimeout(() => { isProcessingRef.current = false; }, 1500);
  };

  const EMPTY_CUSTOMER = { name: '', gst: '', contact: '', address: '' };

  const saveOrder = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const baseUrl = await getBaseUrl();
      const apiBase = baseUrl || import.meta.env.VITE_API_URL || '';
      const authHeader = await getAuthHeader();
      const res = await fetch(`${apiBase}/api/sales/save-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', ...authHeader },
        body: JSON.stringify({ customer, cart, createdBy: staffName || 'Unknown' })
      });
      if (res.ok) {
        showToast('✅ Order Saved!');
        setStep('scan-card'); setCart([]); setCustomer(EMPTY_CUSTOMER); setSelectedShareIds(new Set());
      } else throw new Error();
    } catch (e) {
      setOfflineOrders(prev => [...prev, { customer, cart, createdBy: staffName || 'Unknown', timestamp: new Date().toISOString(), retryCount: 0, permanentlyFailed: false, lastError: null }]);
      showToast('📡 Offline — order saved locally, will sync when connected.');
      setStep('scan-card'); setCart([]); setCustomer(EMPTY_CUSTOMER); setSelectedShareIds(new Set());
    } finally { setIsSaving(false); }
  };

  return (
    <div className="sales-section">
      {showHistory && (
        <UserOrderHistory staffName={staffName} onClose={() => setShowHistory(false)} />
      )}
      <div className="section-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '8px', borderRadius: '8px' }}>
            ←
          </button>
          <button onClick={() => setShowHistory(true)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '8px', borderRadius: '8px' }}>
            <History size={20} />
          </button>
          <h2 style={{ fontSize: '1.2rem' }}>New Sales Order</h2>
        </div>
        {offlineOrders.length > 0 && (() => {
          const pendingCount = offlineOrders.filter(o => !o.permanentlyFailed).length;
          const failedCount = offlineOrders.filter(o => o.permanentlyFailed).length;
          return (
            <button
              onClick={() => syncOfflineOrders()}
              disabled={isSyncing || pendingCount === 0}
              style={{ background: isSyncing ? '#78350f' : failedCount > 0 ? '#7f1d1d' : '#92400e', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', minWidth: '110px', justifyContent: 'center' }}
            >
              {isSyncing
                ? <><Loader2 size={14} className="spinner" /> {syncProgress.done}/{syncProgress.total}</>
                : failedCount > 0
                  ? <><WifiOff size={14} /> {pendingCount} pending, {failedCount} failed</>
                  : <><WifiOff size={14} /> Offline ({pendingCount})</>
              }
            </button>
          );
        })()}
      </div>

      {offlineOrders.length > 0 && (() => {
        const pendingCount = offlineOrders.filter(o => !o.permanentlyFailed).length;
        const failedCount = offlineOrders.filter(o => o.permanentlyFailed).length;
        return (
          <div style={{ background: failedCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.15)', border: `1px solid ${failedCount > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '16px' }}>
            {pendingCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: failedCount > 0 ? '6px' : 0 }}>
                <WifiOff size={15} color="#f59e0b" />
                <span style={{ fontSize: '0.8rem', color: '#fbbf24' }}><strong>{pendingCount}</strong> order(s) offline — waiting to sync.</span>
              </div>
            )}
            {failedCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>⚠️ <strong>{failedCount}</strong> order(s) failed after {MAX_RETRIES} attempts. Please contact admin.</span>
              </div>
            )}
          </div>
        );
      })()}

      {step === 'scan-card' && <CustomerScannerSelection onScanClick={() => setActiveScanner('ocr')} onSkipClick={() => setStep('edit-customer')} />}
      {step === 'edit-customer' && <CustomerDetailsForm customer={customer} setCustomer={setCustomer} customerSearch={customerSearch} searchResults={searchResults} searchCustomers={searchCustomers} selectExistingCustomer={c => { setCustomer({...c}); setCustomerSearch(''); setSearchResults([]); }} onContinue={() => setStep('add-products')} />}
      {step === 'add-products' && <OrderBuilder customer={customer} cart={cart} recentItems={recentItems} isSaving={isSaving} totalValue={cart.reduce((s, i) => s + (i.rate * i.qty), 0)} selectedShareIds={selectedShareIds} setSelectedShareIds={setSelectedShareIds} onShareClick={() => setShowShareModal(true)} onEditCustomer={() => setStep('edit-customer')} onScanClick={() => setActiveScanner('qr')} onSetPendingProduct={setPendingProduct} onUpdateQty={(id, d) => setCart(cart.map(i => i.cartId === id ? {...i, qty: Math.max(1, i.qty + d)} : i))} onRemoveFromCart={id => setCart(cart.filter(i => i.cartId !== id))} onCancel={() => {
              if (cart.length === 0) { setCart([]); setStep('scan-card'); }
              else setShowCancelConfirm(true);
            }} onSave={() => setShowOrderReview(true)} />}

      {showOrderReview && (() => {
        const saleItems = cart.filter(i => !i.type || i.type === 'sale');
        const interestItems = cart.filter(i => i.type === 'interest');
        const saleTotal = saleItems.reduce((s, i) => s + (i.rate * (i.qty || 1)), 0);
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10,15,30,0.97)', zIndex: 1100, display: 'flex', flexDirection: 'column', color: 'white', overflowY: 'auto' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Order Review</h2>
              <button onClick={() => setShowOrderReview(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>← Edit</button>
            </div>

            <div style={{ padding: '20px', flex: 1 }}>
              {/* Customer */}
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '8px' }}>Customer</div>
                <div style={{ fontWeight: '700', fontSize: '1rem' }}>{customer.name}</div>
                {customer.contact && <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '3px' }}>{customer.contact}</div>}
                {customer.address && <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{customer.address}</div>}
                {customer.gst && <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>GST: {customer.gst}</div>}
              </div>

              {/* Sale Items */}
              {saleItems.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', fontWeight: '700', marginBottom: '8px' }}>Sale Items ({saleItems.length})</div>
                  {saleItems.map((item, idx) => (
                    <div key={item.cartId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < saleItems.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: '0.88rem' }}>
                      <span>{item.name} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>({item.color})</span></span>
                      <span>{item.qty} × ₹{item.rate} = <strong>₹{item.rate * item.qty}</strong></span>
                    </div>
                  ))}
                </div>
              )}

              {/* Interest Items */}
              {interestItems.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#f472b6', textTransform: 'uppercase', fontWeight: '700', marginBottom: '8px' }}>Interest Items ({interestItems.length})</div>
                  {interestItems.map((item, idx) => (
                    <div key={item.cartId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < interestItems.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: '0.88rem', opacity: 0.75 }}>
                      <span>{item.name} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>({item.color})</span></span>
                      <span>{item.qty} pcs</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '12px', padding: '14px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', opacity: 0.7, marginBottom: '6px' }}>
                  <span>Total Items</span><span>{cart.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: '800' }}>
                  <span>Payable (Sales)</span>
                  <span style={{ color: '#10b981' }}>₹{saleTotal}</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowOrderReview(false)} style={{ flex: 1, padding: '15px', borderRadius: '12px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontWeight: '600' }}>
                Edit Order
              </button>
              <button onClick={() => { setShowOrderReview(false); saveOrder(); }} disabled={isSaving} style={{ flex: 2, padding: '15px', borderRadius: '12px', background: 'var(--accent-new)', border: 'none', color: 'white', fontWeight: '700', fontSize: '1rem' }}>
                {isSaving ? 'Saving...' : '✓ Save Order'}
              </button>
            </div>
          </div>
        );
      })()}

      {activeScanner === 'ocr' && <OCRScanner onExtract={handleCustomerExtract} onClose={() => setActiveScanner(null)} />}
      {activeScanner === 'product-ocr' && <OCRScanner mode="product" onExtract={d => {setRegistrationData({...d, qrKey: smartRegKey}); setActiveScanner(null);}} onClose={() => setActiveScanner(null)} />}
      {registrationData && <NewProductRegistry initialData={registrationData} onSave={p => {if(onRefresh)onRefresh(); setPendingProduct(p); setRegistrationData(null);}} onCancel={() => setRegistrationData(null)} />}
      {activeScanner === 'qr' && !pendingProduct && !pendingProductChoice && <QRScanner onScan={handleAddProduct} onClose={() => setActiveScanner(null)} forceFlash={isScannedFlash} />}
      {pendingProduct && <ColorSelectionModal pendingProduct={pendingProduct} bulkSelections={bulkSelections} onUpdateBulkQty={(c, t, d) => setBulkSelections({...bulkSelections, [c]: {...bulkSelections[c], [t]: Math.max(0, bulkSelections[c][t] + d)}})} onAddCustomColor={(c) => { if(c) setBulkSelections({...bulkSelections, [c]: {sale:0, interest:0}}); }} onCancel={() => {setPendingProduct(null); setActiveScanner(null); setTimeout(()=>isProcessingRef.current=false, 1500);}} onConfirm={addBulkToCart} />}

      {/* Scanned product action choice */}
      {pendingProductChoice && (
        <ScannedProductActionSheet
          product={pendingProductChoice}
          onAddToOrder={() => {
            setPendingProduct(pendingProductChoice);
            setPendingProductChoice(null);
          }}
          onUpdate={() => {
            setProductToUpdate(pendingProductChoice);
            setPendingProductChoice(null);
            setShowUpdateModal(true);
          }}
          onClose={() => {
            setPendingProductChoice(null);
            isProcessingRef.current = false;
          }}
        />
      )}

      {/* Product update modal */}
      {showUpdateModal && productToUpdate && (
        <ProductUpdateModal
          product={productToUpdate}
          onSaved={() => { if (onRefresh) onRefresh(); }}
          onClose={() => { setShowUpdateModal(false); setProductToUpdate(null); }}
        />
      )}
      {showShareModal && (
        <BrandedShareModal 
          products={cart.filter(p => selectedShareIds.has(p.cartId))} 
          logoUrl={branding?.logoUrl} 
          defaultPosition={branding?.logoPosition} 
          activeApiUrl={activeApiUrl}
          onBack={() => setShowShareModal(false)} 
        />
      )}

      {/* Toast notification */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '80px', left: '16px', right: '16px', background: 'rgba(30,32,50,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '14px 18px', color: 'white', fontSize: '0.9rem', fontWeight: '600', zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          {toastMsg}
        </div>
      )}

      {/* Cancel order confirm dialog */}
      {showCancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9998, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowCancelConfirm(false)}>
          <div style={{ width: '100%', background: 'var(--secondary-bg)', borderRadius: '20px 20px 0 0', padding: '24px', paddingBottom: '36px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'white', marginBottom: '8px' }}>Discard Order?</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '22px' }}>This will remove {cart.length} item{cart.length !== 1 ? 's' : ''} from your cart.</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowCancelConfirm(false)} style={{ flex: 1, padding: '13px', borderRadius: '12px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', fontWeight: '600', cursor: 'pointer' }}>Keep</button>
              <button onClick={() => { setShowCancelConfirm(false); setCart([]); setStep('scan-card'); }} style={{ flex: 1, padding: '13px', borderRadius: '12px', background: 'rgba(239,68,68,0.85)', border: 'none', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Discard</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SalesSection;
