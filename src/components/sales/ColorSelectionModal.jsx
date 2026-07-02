import React, { useState } from 'react';
import { ShoppingCart, Heart, Plus, Minus, X, Check } from 'lucide-react';

const ColorSelectionModal = ({
    pendingProduct, bulkSelections, onUpdateBulkQty, onAddCustomColor, onCancel, onConfirm
}) => {
    const [showColorInput, setShowColorInput] = useState(false);
    const [newColorValue, setNewColorValue] = useState('');

    const handleAddColor = () => {
        const color = newColorValue.trim().toUpperCase();
        if (color) {
            onAddCustomColor(color);
            setNewColorValue('');
        }
        setShowColorInput(false);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9000, display: 'flex', alignItems: 'flex-end' }}>
          <div className="card" style={{ width: '100%', borderTopLeftRadius: '30px', borderTopRightRadius: '30px', padding: '30px 20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem' }}>{pendingProduct.name}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{pendingProduct.uid} | Select Colors & Qty</p>
              </div>
              <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '8px', borderRadius: '50%' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {Object.entries(bulkSelections).map(([color, qtys]) => (
                <div key={color} style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '0.9rem' }}>{color}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    {/* Sale Column */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ShoppingCart size={12} /> SALE
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '10px', padding: '5px' }}>
                        <button onClick={() => onUpdateBulkQty(color, 'sale', -1)} style={{ background: 'none', border: 'none', color: '#10b981', padding: '5px' }}><Minus size={16}/></button>
                        <span style={{ flex: 1, textAlign: 'center', fontWeight: 'bold', color: '#10b981' }}>{qtys.sale}</span>
                        <button onClick={() => onUpdateBulkQty(color, 'sale', 1)} style={{ background: 'none', border: 'none', color: '#10b981', padding: '5px' }}><Plus size={16}/></button>
                      </div>
                    </div>
                    {/* Interest Column */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#f43f5e', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Heart size={12} /> INTEREST
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(244, 63, 94, 0.1)', borderRadius: '10px', padding: '5px' }}>
                        <button onClick={() => onUpdateBulkQty(color, 'interest', -1)} style={{ background: 'none', border: 'none', color: '#f43f5e', padding: '5px' }}><Minus size={16}/></button>
                        <span style={{ flex: 1, textAlign: 'center', fontWeight: 'bold', color: '#f43f5e' }}>{qtys.interest}</span>
                        <button onClick={() => onUpdateBulkQty(color, 'interest', 1)} style={{ background: 'none', border: 'none', color: '#f43f5e', padding: '5px' }}><Plus size={16}/></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {showColorInput ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    autoFocus
                    value={newColorValue}
                    onChange={e => setNewColorValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddColor(); if (e.key === 'Escape') setShowColorInput(false); }}
                    placeholder="Color name..."
                    style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '10px 14px', borderRadius: '10px', fontSize: '0.9rem', outline: 'none' }}
                  />
                  <button onClick={handleAddColor} style={{ background: 'rgba(16,185,129,0.15)', border: 'none', color: '#10b981', padding: '10px 14px', borderRadius: '10px' }}>
                    <Check size={18} />
                  </button>
                  <button onClick={() => setShowColorInput(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '10px 14px', borderRadius: '10px' }}>
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowColorInput(true)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', color: 'white', padding: '12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '600' }}
                >
                  + Add Another Color
                </button>
              )}

              <button 
                onClick={onConfirm}
                disabled={!Object.values(bulkSelections).some(q => q.sale > 0 || q.interest > 0)}
                style={{
                  marginTop: '10px', padding: '16px', borderRadius: '15px', border: 'none',
                  background: 'var(--accent-new)', color: 'white', fontWeight: 'bold', fontSize: '1rem',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)'
                }}
              >
                Add {Object.values(bulkSelections).reduce((sum, q) => sum + q.sale + q.interest, 0)} Items to Cart
              </button>
            </div>
          </div>
        </div>
    );
};

export default ColorSelectionModal;
