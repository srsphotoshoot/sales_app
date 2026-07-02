import React, { useState } from 'react';
import { X, Plus, Loader2, Check, Edit3 } from 'lucide-react';
import { updateProduct } from '../services/api.js';

export default function ProductUpdateModal({ product, onSaved, onClose }) {
  const initialColors = product.color
    ? product.color.split(',').map(c => c.trim()).filter(Boolean)
    : (Array.isArray(product.colors) ? [...product.colors] : []);

  const [name, setName] = useState(product.name || '');
  const [rate, setRate] = useState(String(product.rate || ''));
  const [colors, setColors] = useState(initialColors);
  const [newColor, setNewColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addColor = () => {
    const c = newColor.trim().toUpperCase();
    if (c && !colors.includes(c)) setColors([...colors, c]);
    setNewColor('');
  };

  const removeColor = (c) => setColors(colors.filter(x => x !== c));

  const handleSave = async () => {
    if (!name.trim()) { setError('Name required'); return; }
    setSaving(true);
    setError('');
    try {
      await updateProduct(product.uid, {
        name: name.trim(),
        rate: parseFloat(rate) || product.rate,
        color: colors.join(', ') || 'General',
        colors,
      });
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', background: 'var(--secondary-bg)', borderRadius: '20px 20px 0 0', padding: '24px', paddingBottom: '36px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Edit3 size={18} color="#818cf8" />
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>Update Product</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.85rem', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* ID (readonly) */}
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', marginBottom: '5px' }}>PRODUCT ID</p>
            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
              {product.id}
            </div>
          </div>

          {/* Name */}
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', marginBottom: '5px' }}>NAME</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '0.95rem', outline: 'none' }}
            />
          </div>

          {/* Rate */}
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', marginBottom: '5px' }}>RATE (₹)</p>
            <input
              type="number"
              value={rate}
              onChange={e => setRate(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', color: 'var(--accent-new)', fontSize: '1rem', fontWeight: '700', outline: 'none' }}
            />
          </div>

          {/* Colors */}
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', marginBottom: '8px' }}>COLORS</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', minHeight: '32px' }}>
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => removeColor(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '20px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  {c} <X size={12} />
                </button>
              ))}
              {colors.length === 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>No colors added</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={newColor}
                onChange={e => setNewColor(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && addColor()}
                placeholder="Add color..."
                style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '0.9rem', outline: 'none' }}
              />
              <button
                onClick={addColor}
                style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', padding: '15px', borderRadius: '14px', background: saving ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.8)', border: 'none', color: 'white', fontWeight: '700', fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '4px' }}
          >
            {saving
              ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
              : <><Check size={18} /> Save Changes</>
            }
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
