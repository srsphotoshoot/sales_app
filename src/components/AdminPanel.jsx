import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, RefreshCw, Key, Users, Settings, Package, ShoppingCart, 
  Heart, Award, Sparkles, FileUp, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Components
import KeyManagement from './admin/KeyManagement';
import StaffManagement from './admin/StaffManagement';
import BrandingSettings from './admin/BrandingSettings';
import InventorySubPanel from './admin/InventorySubPanel';
import SalesHistoryPanel from './admin/SalesHistoryPanel';
import PerformancePanel from './admin/PerformancePanel';
import SystemSettings from './admin/SystemSettings';
import BulkUploadPanel from './admin/BulkUploadPanel';
import BulkImageUploader from './BulkImageUploader';
import ProductImageManager from './admin/ProductImageManager';

// Utils
import { updateProduct, deleteOrder, deleteProduct, getBaseUrl, saveBaseUrl } from '../services/api';
import { generateOrderPdf } from '../utils/pdfGenerator';

const EditProductModal = ({ product, loading, onSave, onClose }) => {
  const [form, setForm] = React.useState({
    name: product.name || '',
    rate: product.rate || 0,
    color: product.color || '',
    pcs: product.pcs || 0,
  });

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '30px', animation: 'scaleUp 0.3s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
          <h3 style={{ margin: 0 }}>Edit Product</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white' }}><X size={24} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
          {[
            { label: 'Product Name', key: 'name', type: 'text' },
            { label: 'Rate (₹)', key: 'rate', type: 'number' },
            { label: 'Color', key: 'color', type: 'text' },
            { label: 'Quantity (PCS)', key: 'pcs', type: 'number' },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label style={{ fontSize: '0.75rem', opacity: 0.5, display: 'block', marginBottom: '8px' }}>{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white' }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={() => onSave(form)}
          disabled={loading}
          className="action-btn"
          style={{ width: '100%', padding: '15px', fontWeight: 'bold', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Saving...' : 'Save Product Details'}
        </button>
      </div>
    </div>
  );
};

const AdminPanel = ({ onBack, activeApiUrl, products, onRefresh, overrideToken }) => {
  const [currentTab, setCurrentTab] = useState('keys');
  const [activeKeys, setActiveKeys] = useState([]);
  const [staff, setStaff] = useState([]);
  const [branding, setBranding] = useState({ logoUrl: '', logoPosition: 'top-right' });
  const [salesHistory, setSalesHistory] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [bulkUploadSummary, setBulkUploadSummary] = useState(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  
  const [manualHubUrl, setManualHubUrl] = useState('');
  const [hubStatus, setHubStatus] = useState('unknown');
  const [isCheckingHub, setIsCheckingHub] = useState(false);
  const [perfTimeframe, setPerfTimeframe] = useState('all');

  // Edit / Add Product State
  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => {
    if (currentTab === 'keys') fetchActiveKeys();
    if (currentTab === 'staff') fetchStaff();
    if (currentTab === 'branding') fetchBranding();
    if (['sales', 'interests', 'performance'].includes(currentTab)) fetchSalesHistory();
    if (currentTab === 'inventory' ) fetchInventoryLogs();
  }, [currentTab]);

  useEffect(() => {
    const initConnection = async () => {
      const url = await getBaseUrl();
      setManualHubUrl(url);
      checkHubConnection(url);
    };
    initConnection();
  }, []);

  const checkHubConnection = async (targetUrl) => {
    if (!targetUrl) { setHubStatus('offline'); return; }
    setIsCheckingHub(true);
    try {
      const res = await fetch(`${targetUrl.replace(/\/$/, '')}/api/health`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      const data = await res.json();
      // Use the deep health hubStatus if available, otherwise fallback to local backend success
      setHubStatus(data.hubStatus || (data.success ? 'online' : 'offline'));
    } catch (e) { setHubStatus('offline'); }
    finally { setIsCheckingHub(false); }
  };

  const getHeaders = async () => {
    const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };
    if (overrideToken) { headers['Authorization'] = `Bearer ${overrideToken}`; return headers; }
    const { value: sessionData } = await Preferences.get({ key: 'auth_session' });
    if (sessionData) {
      const { token } = JSON.parse(sessionData);
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const safeApiUrl = (activeApiUrl || import.meta.env.VITE_API_URL || '').toString().replace(/\/$/, '');

  const safeFetch = async (endpoint, options = {}) => {
    if (!safeApiUrl && endpoint.startsWith('/api')) throw new Error("Backend URL (Hub URL) is not configured.");
    
    // Auto-Headers for convenience
    const defaultHeaders = await getHeaders();
    if (options.body instanceof FormData) {
        delete defaultHeaders['Content-Type'];
    }
    
    const finalOptions = {
        ...options,
        headers: { ...defaultHeaders, ...(options.headers || {}) }
    };

    const url = `${safeApiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const res = await fetch(url, finalOptions);
    if (!res.ok) throw new Error(`Server Error (${res.status})`);
    return res;
  };

  const fetchActiveKeys = async () => {
    setTabLoading(true);
    try {
      const headers = await getHeaders();
      const res = await safeFetch('/api/admin/active-keys', { headers });
      const data = await res.json();
      setActiveKeys(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
    finally { setTabLoading(false); }
  };

  const fetchSalesHistory = async () => {
    setTabLoading(true);
    try {
      const headers = await getHeaders();
      const res = await safeFetch('/api/sales/history', { headers });
      const data = await res.json();
      setSalesHistory(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
    finally { setTabLoading(false); }
  };

  const fetchInventoryLogs = async () => {
    setTabLoading(true);
    try {
      const headers = await getHeaders();
      const res = await safeFetch('/api/inventory/logs', { headers });
      const data = await res.json();
      setInventoryLogs(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
    finally { setTabLoading(false); }
  };


  const handleDeleteProduct = async (uid) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteProduct(uid);
      alert("Product deleted");
      if (onRefresh) onRefresh();
    } catch (err) { alert('Delete failed'); }
  };

  const handleUpdateProductFull = async (uid, updates) => {
    setLoading(true);
    try {
      await updateProduct(uid, updates);
      alert("Product updated successfully");
      setEditingProduct(null);
      if (onRefresh) onRefresh();
    } catch (err) { alert('Update failed'); }
    finally { setLoading(false); }
  };
  const fetchStaff = async () => {
    setTabLoading(true);
    try {
      const headers = await getHeaders();
      const res = await safeFetch('/api/admin/staff', { headers });
      const data = await res.json();
      setStaff(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
    finally { setTabLoading(false); }
  };

  const fetchBranding = async () => {
    try {
      const res = await safeFetch('/api/admin/branding');
      const data = await res.json();
      // No prepending needed, proxy handles it
      setBranding(data);
    } catch (err) { console.error('Branding fetch failed', err); }
  };

  const handleHubSync = async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const res = await safeFetch('/api/products/sync', { 
        method: 'POST',
        headers 
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Sync Complete: Pulled ${data.count} items from Hub.`);
        if (onRefresh) onRefresh();
      } else {
        alert(`❌ Sync Failed: ${data.message}`);
      }
    } catch (err) {
      console.error(err);
      alert('❌ Connection Error: Could not reach Hub for sync.');
    } finally {
      setLoading(false);
    }
  };

  const generateKey = async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const res = await safeFetch('/api/admin/generate-key', { method: 'POST', headers });
      const data = await res.json();
      if (data.success) {
        setNewKey(data.key);
        fetchActiveKeys();
      }
    } catch (err) { alert('Failed to generate key.'); }
    finally { setLoading(false); }
  };


  const handleLogoUpload = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const headers = await getHeaders();
      delete headers['Content-Type']; // Let browser set boundary
      
      const formData = new FormData();
      formData.append('logo', file);
      
      const res = await safeFetch('/api/admin/logo/upload', {
        method: 'POST',
        headers,
        body: formData
      });
      
      const data = await res.json();
      if (data.success) {
        alert("Logo updated successfully!");
        fetchBranding();
      }
    } catch (err) {
      alert("Logo upload failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaff = async (id) => {
    if (!window.confirm("Delete staff?")) return;
    try {
      const headers = await getHeaders();
      await safeFetch(`/api/admin/staff/${id}`, { method: 'DELETE', headers });
      fetchStaff();
    } catch (e) { alert("Delete failed"); }
  };

  const handleToggleStaff = async (id) => {
    try {
      const headers = await getHeaders();
      await safeFetch('/api/admin/staff/toggle', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id })
      });
      fetchStaff();
    } catch (e) { alert("Toggle failed"); }
  };

  const handleAddStaff = async (name, code) => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      await safeFetch('/api/admin/staff/add', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, code })
      });
      fetchStaff();
      alert("Staff registered!");
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const ws = XLSX.utils.aoa_to_sheet([
        ['UID', 'Name', 'Rate', 'PCS', 'Color'],
        ['26859600', 'Sample Product A', 1550, 20, 'RED'],
        ['36859601', 'Sample Product B', 3495, 10, 'BLUE'],
        ['48596002', 'Sample Product C', 6995, 15, 'General'],
      ]);
      ws['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      const filename = 'inventory_template.xlsx';
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
      await Share.share({ title: filename, url: uri });
    } catch (e) {
      alert('Template download failed: ' + e.message);
    }
  };

  const handleBulkUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        const productsList = jsonData.map(row => ({
          uid: (row.UID || row.uid || row.Qr || '').toString().trim(),
          name: (row.Name || row.name || '').toString().trim(),
          rate: Number(row.Rate || row.rate) || 0,
          pcs: Number(row.PCS || row.pcs || row.Stock) || 0,
          color: (row.Color || row.color || 'General').toString().trim()
        })).filter(p => p.uid && p.name);

        const existing = new Set(products.map(p => p.uid));
        setBulkUploadSummary({
          total: productsList.length,
          newCount: productsList.filter(p => !existing.has(p.uid)).length,
          updateCount: productsList.filter(p => existing.has(p.uid)).length,
          data: productsList
        });
      } catch (err) { alert('Analysis failed'); }
      finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmBulkUpload = async () => {
    setIsBulkProcessing(true);
    try {
      const headers = await getHeaders();
      await safeFetch('/api/inventory/bulk-upload', {
        method: 'POST',
        headers,
        body: JSON.stringify({ products: bulkUploadSummary.data })
      });
      alert("Successfully uploaded!");
      if (onRefresh) onRefresh();
      setCurrentTab('inventory');
      setBulkUploadSummary(null);
    } catch (err) { alert('Upload failed'); }
    finally { setIsBulkProcessing(false); }
  };

  const getPerformanceData = () => {
    const perf = {};
    const filtered = salesHistory.filter(o => {
      const d = new Date(o.timestamp);
      const now = new Date();
      if (perfTimeframe === 'today') return d.toDateString() === now.toDateString();
      if (perfTimeframe === 'week') return d >= new Date(now - 7 * 24 * 60 * 60 * 1000);
      if (perfTimeframe === 'month') return d >= new Date(now.getFullYear(), now.getMonth(), 1);
      return true;
    });
    filtered.forEach(o => {
      const user = o.createdBy || 'Office';
      if (!perf[user]) perf[user] = { name: user, salesValue: 0, salesCount: 0, orderCount: 0 };
      perf[user].orderCount++;
      (o.cart || []).forEach(item => {
        if (item.type !== 'interest') {
          perf[user].salesCount += (item.qty || 0);
          perf[user].salesValue += (item.rate * item.qty);
        }
      });
    });
    return Object.values(perf).sort((a,b) => b.salesValue - a.salesValue);
  };

  const [toastVisible, setToastVisible] = useState(false);
  const copyToClipboard = (key) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopiedKey(key);
    setToastVisible(true);
    setTimeout(() => { setCopiedKey(null); setToastVisible(false); }, 2000);
  };

  const handleSaveBaseUrl = async (url) => {
    await saveBaseUrl(url);
    alert('Hub URL Updated');
    checkHubConnection(url);
  };

  return (
    <div className="full-screen-overlay" style={{ background: '#0f172a' }}>
      {toastVisible && (
        <div style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: '#10b981', color: 'white', padding: '10px 20px', borderRadius: '30px', fontWeight: '600', fontSize: '0.85rem', zIndex: 99999, boxShadow: '0 4px 20px rgba(16,185,129,0.4)', pointerEvents: 'none' }}>
          Copied to clipboard!
        </div>
      )}
      <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'white' }}><ArrowLeft size={24} /></button>
        <h2 style={{ fontSize: '1.2rem' }}>Admin Dashboard</h2>
      </div>

      <div className="scroll-tabs" style={{ background: 'rgba(255,255,255,0.02)' }}>
        {[
          { id: 'keys', icon: Key, label: 'Keys' },
          { id: 'staff', icon: Users, label: 'Staff' },
          { id: 'branding', icon: Settings, label: 'Branding' },
          { id: 'inventory', icon: Package, label: 'Inventory' },
          { id: 'bulk', icon: FileUp, label: 'Bulk Upload' },
          { id: 'images', icon: Sparkles, label: 'Image Mapping' },
          { id: 'sales', icon: ShoppingCart, label: 'Sales' },
          { id: 'interests', icon: Heart, label: 'Interests' },
          { id: 'performance', icon: Award, label: 'Performance' },
          { id: 'system', icon: Settings, label: 'System' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setCurrentTab(tab.id)}
            style={{
              padding: '12px 20px', borderRadius: '10px', border: 'none',
              background: currentTab === tab.id ? 'var(--accent-new)' : 'transparent',
              color: currentTab === tab.id ? 'white' : 'rgba(255,255,255,0.5)',
              display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.85rem'
            }}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="admin-content" style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        {currentTab === 'keys' && <KeyManagement newKey={newKey} activeKeys={activeKeys} generateKey={generateKey} copyToClipboard={copyToClipboard} copiedKey={copiedKey} loading={loading} />}
        {currentTab === 'staff' && <StaffManagement staff={staff} onAddStaff={handleAddStaff} onToggleStaff={handleToggleStaff} onDeleteStaff={handleDeleteStaff} loading={loading} />}
        {currentTab === 'branding' && <BrandingSettings branding={branding} onUpdateBranding={async (b) => {
            setBranding({...branding, ...b});
            try {
              await safeFetch('/api/admin/branding/update', {
                method: 'POST',
                body: JSON.stringify({ logoPosition: b.logoPosition || branding.logoPosition })
              });
            } catch (e) { console.error('Branding save failed', e); }
          }} onUploadLogo={handleLogoUpload} activeApiUrl={safeApiUrl} />}
        {currentTab === 'inventory' && (
          <InventorySubPanel
            products={products}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onEditProduct={setEditingProduct}
            onRefresh={onRefresh}
            activeApiUrl={safeApiUrl}
            loading={loading}
          />
        )}
        {currentTab === 'bulk' && <BulkUploadPanel onDownloadTemplate={handleDownloadTemplate} onHandleBulkUpload={handleBulkUpload} bulkUploadSummary={bulkUploadSummary} onConfirmBulkUpload={confirmBulkUpload} onCancel={() => setBulkUploadSummary(null)} isBulkProcessing={isBulkProcessing} loading={loading} />}
        {currentTab === 'images' && (
          <div>
            <ProductImageManager
              products={products || []}
              activeApiUrl={safeApiUrl}
              safeFetch={safeFetch}
              onComplete={() => onRefresh && onRefresh()}
            />
            <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <h5 style={{ marginBottom: '12px', opacity: 0.5, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Auto-Map by Filename</h5>
              <BulkImageUploader activeApiUrl={safeApiUrl} safeFetch={safeFetch} onComplete={() => onRefresh && onRefresh()} />
            </div>
          </div>
        )}
        {(currentTab === 'sales' || currentTab === 'interests') && <SalesHistoryPanel
            salesHistory={salesHistory}
            type={currentTab === 'interests' ? 'interest' : 'sale'}
            onDeleteOrder={async (orderId) => {
              if (!window.confirm('Delete this order permanently?')) return;
              try {
                await deleteOrder(orderId);
                setSalesHistory(prev => prev.filter(o => o.orderId !== orderId));
              } catch (e) { alert('Delete failed: ' + e.message); }
            }}
            onGeneratePdf={generateOrderPdf}
          />}
        {currentTab === 'performance' && <PerformancePanel performanceData={getPerformanceData()} perfTimeframe={perfTimeframe} setPerfTimeframe={setPerfTimeframe} />}
        {currentTab === 'system' && <SystemSettings hubStatus={hubStatus} manualHubUrl={manualHubUrl} setManualHubUrl={setManualHubUrl} onSaveHubUrl={() => handleSaveBaseUrl(manualHubUrl)} onCheckConnection={() => checkHubConnection(manualHubUrl)} isCheckingHub={isCheckingHub} />}
      </div>

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          loading={loading}
          onSave={(updates) => handleUpdateProductFull(editingProduct.uid, updates)}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
};

export default AdminPanel;
