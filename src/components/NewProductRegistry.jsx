import React, { useState } from 'react';
import { Package, Save, X, CheckCircle2, AlertCircle, Loader2, Plus } from 'lucide-react';
import { registerProduct } from '../services/api';

const NewProductRegistry = ({ initialData, onSave, onCancel }) => {
  const [product, setProduct] = useState(() => {
    // Priority 1: Rate from OCR (Sticker)
    // Priority 2: Rate from UID (QR 8-digit code)
    // Priority 3: Default 1.0
    
    let initialRate = initialData.rate || 1.0;
    const uid = initialData.qrKey || '';
    
    if (!initialData.rate && uid.length === 8) {
      const parsedRate = parseInt(uid.substring(2, 6));
      if (!isNaN(parsedRate)) initialRate = parsedRate;
    }

    return {
      uid: uid,
      id: initialData.id || '',
      name: initialData.name || initialData.id || '',
      compulsoryData: initialData.compulsoryData || '',
      colors: initialData.colors || [],
      rate: initialRate,
      pcs: 0
    };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [showColorInput, setShowColorInput] = useState(false);
  const [newColorValue, setNewColorValue] = useState('');

  const handleSave = async () => {
    if (!product.id || !product.name) {
      setError('Product ID and Name are required');
      return;
    }
    const parsedRate = parseFloat(product.rate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setError('Rate must be a valid number greater than 0');
      return;
    }
    
    setIsSaving(true);
    setError('');
    try {
      // Map 'colors' array to the format the backend expects (usually single color per record, but here we save as array or pick primary)
      // Since the user said "colour names as colours", we'll save the whole array as a comma string or pick the first.
      // Let's store colors as a string for now.
      const productToSave = {
        ...product,
        rate: parsedRate,
        color: product.colors.join(', ') || 'General'
      };
      
      const result = await registerProduct(productToSave);
      if (result.success) {
        onSave(result.product);
      } else {
        setError(result.message || 'Failed to save product');
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="registration-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.95)', display: 'flex', flexDirection: 'column',
      zIndex: 1100, color: 'white', padding: '20px'
    }}>
      <div className="card" style={{ maxWidth: '500px', margin: 'auto', width: '100%', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Package className="text-accent" />
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Register New Product</h2>
            </div>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'white' }}><X size={24} /></button>
        </div>

        {error && (
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SCANNED CODE (UID)</label>
                <input disabled value={product.uid} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>PRODUCT ID (4-6 DIGIT)</label>
                    <input 
                      value={product.id} 
                      onChange={(e) => setProduct({...product, id: e.target.value, name: e.target.value})} 
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--secondary-bg)', color: 'white' }} 
                    />
                </div>
                <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>IMPORTANT (8 DIGIT)</label>
                    <input 
                      value={product.compulsoryData} 
                      onChange={(e) => setProduct({...product, compulsoryData: e.target.value})} 
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--secondary-bg)', color: 'white' }} 
                    />
                </div>
            </div>

            <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>COLORS</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', minHeight: '40px', alignItems: 'center' }}>
                    {product.colors.map(c => (
                        <span key={c} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--accent-new)', color: 'white', padding: '4px 6px 4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            {c}
                            <button onClick={() => setProduct({ ...product, colors: product.colors.filter(x => x !== c) })} style={{ background: 'none', border: 'none', color: 'white', padding: '0', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                    {showColorInput ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                                autoFocus
                                value={newColorValue}
                                onChange={e => setNewColorValue(e.target.value.toUpperCase())}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        const c = newColorValue.trim();
                                        if (c && !product.colors.includes(c)) setProduct({ ...product, colors: [...product.colors, c] });
                                        setNewColorValue(''); setShowColorInput(false);
                                    }
                                    if (e.key === 'Escape') { setNewColorValue(''); setShowColorInput(false); }
                                }}
                                placeholder="COLOR"
                                style={{ padding: '3px 8px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '0.75rem', width: '80px', outline: 'none' }}
                            />
                            <button
                                onClick={() => {
                                    const c = newColorValue.trim();
                                    if (c && !product.colors.includes(c)) setProduct({ ...product, colors: [...product.colors, c] });
                                    setNewColorValue(''); setShowColorInput(false);
                                }}
                                style={{ background: 'rgba(16,185,129,0.2)', border: 'none', color: '#10b981', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                                <Plus size={12} />
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setShowColorInput(true)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', cursor: 'pointer' }}>
                            + Add
                        </button>
                    )}
                    {product.colors.length === 0 && !showColorInput && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>None detected — add manually</span>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>DEFAULT RATE</label>
                    <input 
                      type="number"
                      value={product.rate} 
                      onChange={(e) => setProduct({...product, rate: e.target.value})} 
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--secondary-bg)', color: 'white' }} 
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button 
                      onClick={handleSave}
                      disabled={isSaving}
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--accent-new)', color: 'white', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      {isSaving ? <Loader2 className="spinner" size={20} /> : <Save size={20} />}
                      {isSaving ? 'Saving...' : 'Register Product'}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default NewProductRegistry;
