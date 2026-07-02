import React, { useState, useEffect, useRef } from 'react';
import { Package, Plus, Search, RefreshCw, X, CheckCircle2, AlertCircle, Edit3 } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Ocr } from '@capacitor-community/image-to-text';
import { fetchProducts, fetchCatalogProductById } from '../services/api';
import QRScanner from './QRScanner.jsx';
import NewProductRegistry from './NewProductRegistry.jsx';
import ProductUpdateModal from './ProductUpdateModal.jsx';

const FastProductCreator = ({ onBack, activeApiUrl }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeScanner, setActiveScanner] = useState(null);
  const [registrationData, setRegistrationData] = useState(null);
  const [recentAdded, setRecentAdded] = useState([]);
  const [productToEdit, setProductToEdit] = useState(null);
  const isProcessing = useRef(false);

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    setLoadError('');
    try { setProducts(await fetchProducts()); }
    catch { setLoadError('Failed to load products. Check connection and refresh.'); }
    finally { setLoading(false); }
  };

  // Same barcode + inline OCR flow as SalesSection.handleAddProduct
  const handleBarcodeScan = async (uid, getSnapshot) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    try {
      // Duplicate check → open update modal directly
      const existing = products.find(p =>
        p.uid === uid ||
        String(p.id) === String(uid) ||
        (Array.isArray(p.barcodes) && p.barcodes.includes(uid))
      );
      if (existing) {
        setActiveScanner(null);
        setProductToEdit(existing);
        return;
      }

      let parsedId = '';
      let parsedRate = 1;

      // Inline OCR on barcode label snapshot
      if (getSnapshot) {
        const snapshot = await getSnapshot();
        if (snapshot) {
          try {
            const base64Data = snapshot.replace(/^data:image\/\w+;base64,/, '');
            const tmpFile = `ocr_fp_${Date.now()}.jpg`;
            await Filesystem.writeFile({ path: tmpFile, data: base64Data, directory: Directory.Cache });
            try {
              const { uri } = await Filesystem.getUri({ path: tmpFile, directory: Directory.Cache });
              const { textDetections } = await Ocr.detectText({ filename: uri });
              const ocrText = (textDetections || []).map(d => d.text.trim()).join(' ');
              const sevenDigit = (ocrText.match(/\d+/g) || []).find(t => t.length === 7);
              if (sevenDigit) {
                parsedId = sevenDigit.substring(2, sevenDigit.length - 1);
                parsedRate = parseInt(sevenDigit.substring(0, 2) + '95');
              }
            } finally {
              Filesystem.deleteFile({ path: tmpFile, directory: Directory.Cache }).catch(() => {});
            }
          } catch {}
        }
      }

      // Catalogue lookup for colours + name
      let colors = [];
      if (parsedId) {
        const catProduct = await fetchCatalogProductById(parsedId);
        if (catProduct?.variants) {
          colors = [...new Set(catProduct.variants.map(v => v.color).filter(Boolean))];
          if (!parsedRate && catProduct.price) parsedRate = catProduct.price;
        }
      }

      setActiveScanner(null);
      setRegistrationData({ id: parsedId, name: parsedId, rate: parsedRate, qrKey: uid, colors });
    } catch (e) {
      console.error('Scan error:', e);
      setActiveScanner(null);
    } finally {
      isProcessing.current = false;
    }
  };

  const handleSaveSuccess = (newProduct) => {
    setRecentAdded(prev => [newProduct, ...prev].slice(0, 5));
    loadProducts();
    setRegistrationData(null);
    isProcessing.current = false;
    setActiveScanner('qr');
  };

  const filteredProducts = products
    .filter(p =>
      p.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 10);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Package className="text-accent" />
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0 }}>Add New Product</h2>
        </div>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '12px', fontSize: '0.9rem' }}>
          Back
        </button>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {/* Scan button */}
        <div className="card" style={{ padding: '30px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.05) 100%)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div style={{ width: '64px', height: '64px', background: 'var(--accent-new)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 10px 25px -5px rgba(16,185,129,0.4)' }}>
            <Plus size={32} color="white" />
          </div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Scan Barcode</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
            Scan a barcode — product code, rate and colours will be auto-detected from the catalogue.
          </p>
          <button
            onClick={() => { isProcessing.current = false; setActiveScanner('qr'); }}
            style={{ width: '100%', padding: '16px', borderRadius: '15px', border: 'none', background: 'var(--accent-new)', color: 'white', fontWeight: '800', fontSize: '1.1rem' }}
          >
            Start Scanning
          </button>
        </div>

        {/* Recent additions */}
        {recentAdded.length > 0 && (
          <div className="card" style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>Recents</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentAdded.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', borderLeft: `4px solid ${p.duplicate ? '#f59e0b' : '#10b981'}` }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{p.id || p.uid}</div>
                    {p.duplicate
                      ? <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Already in inventory</div>
                      : <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rate: ₹{p.rate} | {p.color}</div>
                    }
                  </div>
                  {p.duplicate ? <AlertCircle size={20} color="#f59e0b" /> : <CheckCircle2 size={20} color="#10b981" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input
              placeholder="Search inventory..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading
              ? <div style={{ textAlign: 'center', padding: '20px' }}><RefreshCw className="spinner" /></div>
              : loadError
                ? <div style={{ textAlign: 'center', padding: '20px', color: '#ef4444', fontSize: '0.85rem' }}>{loadError}<br /><button onClick={loadProducts} style={{ marginTop: '8px', padding: '6px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>Retry</button></div>
              : filteredProducts.length > 0
                ? filteredProducts.map(p => (
                    <div key={p.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)' }}>{p.id} — {p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          ₹{p.rate}{p.color ? ` · ${p.color}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => setProductToEdit(p)}
                        style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#818cf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: '600', flexShrink: 0 }}
                      >
                        <Edit3 size={14} /> Edit
                      </button>
                    </div>
                  ))
                : <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No products found</div>
            }
          </div>
        </div>
      </div>

      {activeScanner === 'qr' && (
        <QRScanner onScan={handleBarcodeScan} onClose={() => { setActiveScanner(null); isProcessing.current = false; }} />
      )}

      {registrationData && (
        <NewProductRegistry
          initialData={registrationData}
          onSave={handleSaveSuccess}
          onCancel={() => { setRegistrationData(null); isProcessing.current = false; }}
        />
      )}

      {productToEdit && (
        <ProductUpdateModal
          product={productToEdit}
          onSaved={() => loadProducts()}
          onClose={() => setProductToEdit(null)}
        />
      )}
    </div>
  );
};

export default FastProductCreator;
