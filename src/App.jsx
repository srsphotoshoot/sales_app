import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, History, Sparkles, TrendingUp, BarChart3, ShoppingBag, Plus, LogOut, User, AlertTriangle, Package, Menu, QrCode, BookOpen, Award } from 'lucide-react';
import { Preferences } from '@capacitor/preferences';
import { fetchProducts, getBaseUrl, getAbsoluteImageUrl } from './services/api';
import AuthImage from './components/AuthImage.jsx';
import ImageLightbox from './components/ImageLightbox.jsx';
import SalesSection from './components/SalesSection';
import LoginScreen from './components/LoginScreen.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import BrandedShareModal from './components/BrandedShareModal.jsx';
import FastProductCreator from './components/FastProductCreator.jsx';
import CatalogSection from './components/CatalogSection.jsx';
import ExhibitionSection from './components/ExhibitionSection.jsx';
import { Share2, X as CloseIcon, Camera as CameraIcon } from 'lucide-react';

const App = () => {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('clearance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Auth & Admin State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  
  const headerClickRef = useRef(0);
  const lastClickTimeRef = useRef(0);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [activeToken, setActiveToken] = useState(null);
  const [currentStaffName, setCurrentStaffName] = useState('');
  const [branding, setBranding] = useState({ logoUrl: '', logoPosition: 'top-right' });
  const [selectedPromoSIds, setSelectedPromoSIds] = useState(new Set());
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [showFastCreator, setShowFastCreator] = useState(false);
  const [showExhibition, setShowExhibition] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [catalogItem, setCatalogItem] = useState(null);

  const [currentApiUrl, setCurrentApiUrl] = useState(import.meta.env.VITE_API_URL || '');

  useEffect(() => {
    const startup = async () => {
      setAuthLoading(true);
      const url = await initUrl();
      await checkSession(url);
      setAuthLoading(false);
    };
    startup();
    
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const url = await getBaseUrl();
        checkSession(url);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const checkSession = async (providedUrl) => {
    try {
      const baseUrl = providedUrl || currentApiUrl;
      const { value: sessionData } = await Preferences.get({ key: 'auth_session' });
      if (sessionData) {
          const { timestamp, token, role, staffName } = JSON.parse(sessionData);
          const now = Date.now();
          const twoHours = 2 * 60 * 60 * 1000;

          if (now - timestamp < twoHours) {
            setIsAuthenticated(true);
            setActiveToken(token);
            if (staffName) setCurrentStaffName(staffName);

            // Admin panel: only keep open during visibility changes (isAdminAuth already true),
            // never auto-restore on cold start — re-auth via PIN required for security
            if (role === 'Admin' && isAdminAuth) {
              setShowAdmin(true);
            }

            // Update timestamp on every successful check (prolongs session while active)
            // staffName must be preserved so PDFs and order records stay attributed correctly
            await Preferences.set({
              key: 'auth_session',
              value: JSON.stringify({ token, timestamp: now, role, staffName })
            });
        } else {
          handleLogout();
        }
      }
    } catch (err) {
      console.error('Session check error:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const initUrl = async () => {
    const url = await getBaseUrl();
    setCurrentApiUrl(url);

    // Fetch Branding for all users
    try {
      const apiBase = url || import.meta.env.VITE_API_URL || '';
      const bRes = await fetch(`${apiBase}/api/admin/branding`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (bRes.ok) {
        const data = await bRes.json();
        setBranding(data);
      }
    } catch (e) {
      console.error('Branding fetch failed', e);
    }
    return url;
  };

  const handleLogin = async (token, staffName = '') => {
    const now = Date.now();
    await Preferences.set({
      key: 'auth_session',
      value: JSON.stringify({ token, timestamp: now, role: 'Staff', staffName })
    });
    setIsAuthenticated(true);
    setActiveToken(token);
    setCurrentStaffName(staffName);
  };

  const handleLogout = async () => {
    await Preferences.remove({ key: 'auth_session' });
    setIsAuthenticated(false);
    setIsAdminAuth(false);
    setActiveToken(null);
    setShowAdmin(false);
  };

  const handleAdminBack = async () => {
    const { value: sessionData } = await Preferences.get({ key: 'auth_session' });
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      await Preferences.set({
        key: 'auth_session',
        value: JSON.stringify({ ...parsed, role: 'Staff' })
      });
    }
    setShowAdmin(false);
    setIsAdminAuth(false);
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const searchController = useRef(null);

  const loadData = async (query = '') => {
    // Abort previous search if it's still running
    if (searchController.current) {
      searchController.current.abort();
    }
    searchController.current = new AbortController();

    try {
      setLoading(true);
      const data = await fetchProducts(query, searchController.current.signal);
      setProducts(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err.message?.includes('401')) { handleLogout(); return; }
      setError("Failed to sync inventory. Make sure local system is ON.");
      console.error(err);
    } finally {
      if (searchController.current?.signal.aborted) return;
      setLoading(false);
    }
  };


  // Debounced search trigger
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const timer = setTimeout(() => {
      loadData(search);
    }, 500);

    return () => clearTimeout(timer);
  }, [search, isAuthenticated]);

  const handleHeaderClick = () => {
    const now = Date.now();
    // Relaxed timing to 800ms for mobile taps
    if (now - lastClickTimeRef.current < 800) {
      headerClickRef.current += 1;
    } else {
      headerClickRef.current = 1;
    }
    lastClickTimeRef.current = now;

    if (headerClickRef.current >= 5) {
      headerClickRef.current = 0;
      setShowPinEntry(true);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const baseUrl = await getBaseUrl();
      const response = await fetch(`${baseUrl}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ pin: enteredPin })
      });

      const data = await response.json();

      if (data.success) {
        // Essential: Save the Admin Token so AdminPanel fetches are authorized
        await Preferences.set({
          key: 'auth_session',
          value: JSON.stringify({ token: data.sessionToken, timestamp: Date.now(), role: 'Admin' })
        });

        setIsAdminAuth(true);
        setIsAuthenticated(true); // Grant access to the app shell
        setActiveToken(data.sessionToken);
        setShowAdmin(true);
        setShowPinEntry(false);
        setEnteredPin('');
      } else {
        setPinError(data.message || 'Invalid Master PIN');
        setEnteredPin('');
      }
    } catch (err) {
      setPinError('Security server unreachable. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = React.useMemo(() => {
    let result = [...products];
    if (activeTab === 'clearance') {
      result = result.filter(p => p.isClearance || p.isUrgent).sort((a, b) => (b.isUrgent ? 1 : 0) - (a.isUrgent ? 1 : 0) || b.ageDays - a.ageDays);
    } else if (activeTab === 'trending') {
      result = result.filter(p => p.isBestSeller || p.isGoodSignal).sort((a, b) => b.ageDays - a.ageDays);
    }

    // Memory Optimization for Mobile (prevents crashes from loading too many textures)
    return (result || []).slice(0, 150);
  }, [products, activeTab]);


  const handleTabChange = (tab) => setActiveTab(tab);
  const handleSearch = (e) => setSearch(e.target.value);


  // Splash Screen Guard
  if (authLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--primary-bg)' }}>
        <img 
          src="/icon-512.png" 
          alt="SRS Logo" 
          className="animate-pulse"
          style={{ width: '80px', height: '80px', borderRadius: '20px', marginBottom: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }} 
        />
        <div className="spinner" style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--accent-old)', borderRadius: '50%' }}></div>
        <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '1px' }}>VERIFYING SESSION...</p>
      </div>
    );
  }

  const PinEntryUI = showPinEntry ? (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '320px', padding: '30px', textAlign: 'center', border: '1px solid var(--accent-old)' }}>
        <h3 style={{ marginBottom: '20px' }}>Admin Verification</h3>
        <form onSubmit={handlePinSubmit}>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="****"
            value={enteredPin}
            onChange={(e) => { setEnteredPin(e.target.value); setPinError(''); }}
            style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${pinError ? '#ef4444' : 'var(--glass-border)'}`, background: '#0f172a', color: 'white', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '10px', marginBottom: pinError ? '8px' : '20px' }}
          />
          {pinError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '16px' }}>{pinError}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={() => { setShowPinEntry(false); setEnteredPin(''); setPinError(''); }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'white' }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--accent-old)', color: 'white', fontWeight: '700' }}>Verify</button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  if (!isAuthenticated) {
    return (
      <div className="app-container">
        {PinEntryUI}
        <LoginScreen onLogin={handleLogin} activeApiUrl={currentApiUrl} onAdminRequest={() => setShowPinEntry(true)} />
      </div>
    );
  }

  if (showFastCreator) {
    return (
      <div className="app-container">
        <FastProductCreator
          onBack={() => setShowFastCreator(false)}
          activeApiUrl={currentApiUrl}
          overrideToken={activeToken}
        />
      </div>
    );
  }

  if (showExhibition) {
    return (
      <div className="app-container">
        <ExhibitionSection
          products={products}
          activeApiUrl={currentApiUrl}
          staffName={currentStaffName}
          onBack={() => setShowExhibition(false)}
        />
      </div>
    );
  }

  if (showAdmin && isAdminAuth) {
    return (
      <div className="app-container">
        {PinEntryUI}
        <AdminPanel
          onBack={handleAdminBack}
          activeApiUrl={currentApiUrl} 
          products={products}
          onRefresh={(updatedProduct) => { 
            if (updatedProduct && updatedProduct.uid) {
              setProducts(prev => prev.map(p => p.uid === updatedProduct.uid ? updatedProduct : p));
            } else {
              loadData(); 
            }
          }}
          overrideToken={activeToken}
        />
      </div>
    );
  }


  return (
    <div className="app-container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => setShowSidebar(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Menu size={28} />
          </button>
          <img src="/icon-512.png" alt="SRS Logo" onClick={handleHeaderClick} style={{ width: '40px', height: '40px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', objectFit: 'cover', cursor: 'pointer' }} />

          <div onClick={handleHeaderClick} style={{ cursor: 'pointer' }}>
            <h1>Sales SRS</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>AI Powered Stock Strategy</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="stats-icon">
            <BarChart3 size={24} color="var(--accent-old)" />
          </div>
        </div>
      </header>

      {activeTab !== 'sales' && (
        <div className="search-bar-container" style={{ position: 'relative', marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="Search products..." 
            value={search}
            onChange={handleSearch}
            style={{
              width: '100%',
              padding: '14px 14px 14px 44px',
              borderRadius: '12px',
              border: '1px solid var(--glass-border)',
              background: 'var(--secondary-bg)',
              color: 'var(--text-main)',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />
          <Search size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '14px' }} />
        </div>
      )}

      {activeTab !== 'sales' && activeTab !== 'catalog' && (
        <div className="tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          {['clearance', 'trending', 'all'].map(tab => (
            <button 
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              style={{
                minWidth: '100px',
                padding: '10px',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === tab ? (tab === 'clearance' ? 'rgba(239, 68, 68, 0.2)' : tab === 'trending' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.1)') : 'var(--secondary-bg)',
                color: activeTab === tab ? (tab === 'clearance' ? '#ef4444' : tab === 'trending' ? 'var(--accent-old)' : 'var(--text-main)') : 'var(--text-muted)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontSize: '0.85rem'
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'catalog' ? (
        <CatalogSection
          onAddToCart={(item) => {
            setCatalogItem({ ...item, _ts: Date.now() }); // _ts ensures useEffect fires even for same product
            setActiveTab('sales');
          }}
        />
      ) : activeTab === 'sales' ? (
        <SalesSection
          onBack={() => setActiveTab('clearance')}
          activeApiUrl={currentApiUrl}
          products={products}
          onRefresh={loadData}
          branding={branding}
          staffName={currentStaffName}
          catalogItem={catalogItem}
          onCatalogItemConsumed={() => setCatalogItem(null)}
        />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '100px 20px', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ 
            width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', 
            borderTop: '4px solid var(--accent-old)', borderRadius: '50%', margin: '0 auto 16px'
          }}></div>
          <p>Syncing live inventory...</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px' }}>
          <p style={{ marginBottom: '12px' }}>{error}</p>
          <button 
            onClick={loadData} 
            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', fontWeight: '600' }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="product-list product-grid">
          {(filteredProducts || []).map((product, index) => (
             <div 
               key={product.uid} 
               className={`card animate-slide-up ${product.isBestSeller ? 'card-best-seller' : ''}`} 
               style={{ 
                 animationDelay: `${index * 0.05}s`,
                 position: 'relative',
                 padding: '12px',
                 border: (selectedPromoSIds || new Set()).has(product.uid) ? '2px solid var(--accent-new)' : '1px solid var(--glass-border)'
               }}
             >
               {/* Selection Checkbox */}
               <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10 }}>
                 <input 
                   type="checkbox"
                   checked={(selectedPromoSIds || new Set()).has(product.uid)}
                   onChange={() => {
                     const newSet = new Set(selectedPromoSIds || []);
                     if (newSet.has(product.uid)) newSet.delete(product.uid);
                     else newSet.add(product.uid);
                     setSelectedPromoSIds(newSet);
                   }}
                   style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--accent-new)' }}
                 />
               </div>

               {/* Product Image Thumbnail */}
               {(() => {
                 const allImages = (Array.isArray(product.images) && product.images.length > 0
                   ? product.images
                   : product.imageUrl ? [product.imageUrl] : []
                 ).map(u => getAbsoluteImageUrl(u, currentApiUrl));
                 return (
                   <div
                     style={{ width: '100%', height: '150px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.2)', marginBottom: '12px', position: 'relative', cursor: allImages.length > 0 ? 'pointer' : 'default' }}
                     onClick={(e) => { e.stopPropagation(); if (allImages.length > 0) setLightbox({ images: allImages, index: 0 }); }}
                   >
                     <AuthImage
                       src={allImages[0] || null}
                       alt={product.name}
                       style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                       fallback={
                         <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
                           <Package size={32} />
                         </div>
                       }
                     />
                     {allImages.length > 1 && (
                       <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.65)', color: 'white', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: '700' }}>
                         +{allImages.length - 1}
                       </div>
                     )}
                   </div>
                 );
               })()}

               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div className="product-info">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {product.isGoodSignal && <span className="blinking-dot"></span>}
                    <h3>{product.name}</h3>
                  </div>
                  <span className="tag-category" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{product.category}</span>
                </div>
                <span className={`tag ${product.isUrgent ? 'tag-urgent' : product.isClearance ? 'tag-old' : 'tag-new'}`}>
                  {product.status}
                </span>
              </div>
              <div className="product-details" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Color', val: product.color, color: 'var(--text-main)' },
                  { 
                    label: 'Stock', 
                    val: `${product.pcs} PCS`, 
                    color: product.pcs < 10 ? '#ef4444' : 'var(--text-main)',
                    icon: product.pcs < 10 ? <AlertTriangle size={12} style={{ marginRight: '4px' }} /> : null
                  },
                  { label: 'Rate', val: `₹${product.rate}`, color: 'var(--accent-new)', weight: '600' },
                  { label: 'Age', val: `${product.ageDays} Days`, color: product.isOld ? 'var(--accent-old)' : 'var(--text-muted)', weight: '600' }
                ].map((item, i) => (
                  <div key={i} className="detail-item">
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.label}</p>
                    <p style={{ fontWeight: item.weight || '500', color: item.color, display: 'flex', alignItems: 'center' }}>
                      {item.icon}
                      {item.val}
                    </p>
                  </div>
                ))}

              </div>
            </div>
          ))}
        </div>
      )}

      {filteredProducts.length === 150 && activeTab !== 'sales' && activeTab !== 'catalog' && (
        <div style={{ textAlign: 'center', padding: '12px 20px', fontSize: '0.78rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', margin: '8px 16px' }}>
          Showing first 150 results — refine your search to see more.
        </div>
      )}

      {activeTab !== 'sales' && activeTab !== 'catalog' && filteredProducts.length === 0 && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <History size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
          <p>No products found</p>
        </div>
      )}

      <nav className="bottom-nav">
        {[
          { tab: 'clearance', label: 'Stocks', icon: History },
          { tab: 'new', label: 'Latest', icon: Sparkles },
          { tab: 'catalog', label: 'Catalog', icon: BookOpen },
          { tab: 'sales', label: 'Sales', icon: ShoppingBag }
        ].map(item => (
          <button key={item.tab} className={`nav-item ${activeTab === item.tab || (item.tab === 'clearance' && ['trending', 'all', 'old'].includes(activeTab)) ? 'active' : ''}`} onClick={() => handleTabChange(item.tab)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <item.icon size={24} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {activeTab !== 'sales' && activeTab !== 'catalog' && !showAdmin && (
        <button 
          onClick={() => handleTabChange('sales')}
          style={{
            position: 'fixed', bottom: '90px', right: '20px', width: '60px', height: '60px',
            borderRadius: '30px', background: 'var(--accent-new)', color: 'white',
            border: 'none', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99, cursor: 'pointer'
          }}
        >
          <Plus size={32} />
        </button>
      )}

      {/* Sidebar Overlay */}
      {showSidebar && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex' }}
          onClick={() => setShowSidebar(false)}
        >
          <div 
            style={{ width: '280px', height: '100%', background: 'var(--primary-bg)', borderRight: '1px solid var(--glass-border)', padding: '24px 16px', display: 'flex', flexDirection: 'column', transform: 'translateX(0)', transition: 'transform 0.3s ease-in-out' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src="/icon-512.png" alt="SRS" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
                <h2 style={{ fontSize: '1.2rem', color: 'white' }}>Menu</h2>
              </div>
              <button onClick={() => setShowSidebar(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <CloseIcon size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              <button
                onClick={() => { setShowSidebar(false); setShowFastCreator(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}
              >
                <Plus size={24} color="var(--accent-old)" />
                Add Product
              </button>

              <button
                onClick={() => { setShowSidebar(false); setShowExhibition(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}
              >
                <Award size={24} color="#a5b4fc" />
                Exhibition
              </button>

              {showAdmin && (
                <button 
                  onClick={() => { setShowSidebar(false); setShowAdmin(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  <Package size={24} color="#3b82f6" />
                  Inventory Management
                </button>
              )}
            </div>

            <button 
              onClick={() => { setShowSidebar(false); handleLogout(); }}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', marginTop: 'auto' }}
            >
              <LogOut size={24} />
              Logout
            </button>
          </div>
        </div>
      )}

      {/* Promotion Sharing FAB */}
      {selectedPromoSIds.size > 0 && activeTab !== 'sales' && (
        <button 
          onClick={() => setShowPromoModal(true)}
          style={{
            position: 'fixed', bottom: '90px', left: '20px', padding: '0 20px', height: '60px',
            borderRadius: '30px', background: 'var(--accent-new)', color: 'white',
            border: 'none', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', zIndex: 100, cursor: 'pointer'
          }}
        >
          <Share2 size={24} />
          <span style={{ fontWeight: 'bold' }}>Share Promos ({selectedPromoSIds.size})</span>
        </button>
      )}

      {showPromoModal && (
        <BrandedShareModal
          products={(products || []).filter(p => (selectedPromoSIds || new Set()).has(p?.uid))}
          logoUrl={branding?.logoUrl}
          defaultPosition={branding?.logoPosition}
          activeApiUrl={currentApiUrl}
          onBack={() => { setShowPromoModal(false); setSelectedPromoSIds(new Set()); }}
        />
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
};

export default App;
