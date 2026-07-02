import React from 'react';
import { Scan, Share2, History, Plus, Minus, Trash2 } from 'lucide-react';

const OrderBuilder = ({ 
  customer, cart, recentItems, isSaving, totalValue, 
  selectedShareIds, setSelectedShareIds, onShareClick,
  onEditCustomer, onScanClick, 
  onSetPendingProduct, onUpdateQty, onRemoveFromCart, onCancel, onSave 
}) => (
  <div className="order-builder animate-slide-up">
    <div className="customer-chip card" style={{ padding: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Customer</p>
        <p style={{ fontWeight: '600' }}>{customer.name}</p>
      </div>
      <button onClick={onEditCustomer} style={{ background: 'none', border: 'none', color: 'var(--accent-new)', fontSize: '0.8rem' }}>Edit</button>
    </div>

    <button 
      onClick={onScanClick}
      style={{ width: '100%', padding: '18px', borderRadius: '16px', border: '1px dashed var(--accent-new)', background: 'rgba(16, 185, 129, 0.05)', color: 'var(--accent-new)', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
    >
      <Scan size={22} />
      Scan Product QR Code
    </button>

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
       <h3 style={{ fontSize: '1rem', margin: 0 }}>Product Selection</h3>
       {selectedShareIds.size > 0 && (
          <button 
            onClick={onShareClick}
            style={{ 
              background: 'var(--accent-new)', color: 'white', border: 'none', 
              padding: '8px 15px', borderRadius: '20px', fontSize: '0.75rem', 
              fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Share2 size={14} /> Share Branded ({selectedShareIds.size})
          </button>
       )}
    </div>

    {cart.length === 0 ? (
      <div style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.3 }}>
          <p>Your cart is empty. Scan an item to start.</p>
      </div>
    ) : (
      <div className="cart-list" style={{ marginBottom: '30px' }}>
        {cart.map((item) => (
          <div key={item.cartId} className="card" style={{ marginBottom: '10px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                <input 
                  type="checkbox" 
                  checked={selectedShareIds.has(item.cartId)}
                  onChange={() => {
                    const newSet = new Set(selectedShareIds);
                    if (newSet.has(item.cartId)) newSet.delete(item.cartId);
                    else newSet.add(item.cartId);
                    setSelectedShareIds(newSet);
                  }}
                  style={{ width: '18px', height: '18px', marginTop: '4px' }}
                />
                <div>
                  <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.color} | {item.type?.toUpperCase()}</div>
                </div>
              </div>
              <button onClick={() => onRemoveFromCart(item.cartId)} style={{ background: 'none', border: 'none', color: '#ef4444', opacity: 0.6 }}>
                <Trash2 size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <div style={{ fontWeight: '700', color: 'var(--accent-new)' }}>₹{item.rate * (item.qty || 1)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
                <button onClick={() => onUpdateQty(item.cartId, -1)} style={{ background: 'none', border: 'none', color: 'white', padding: '4px' }}><Minus size={14}/></button>
                <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 'bold' }}>{item.qty || 1}</span>
                <button onClick={() => onUpdateQty(item.cartId, 1)} style={{ background: 'none', border: 'none', color: 'white', padding: '4px' }}><Plus size={14}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="order-summary" style={{ padding: '20px', background: 'var(--secondary-bg)', borderRadius: '16px', marginBottom: '80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: 'var(--text-muted)' }}>Items</span>
        <span>{cart.length}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <span style={{ fontSize: '1.1rem', fontWeight: '700' }}>Total Value</span>
        <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--accent-new)' }}>₹{totalValue}</span>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'none', border: '1px solid var(--glass-border)', color: 'white' }}>Cancel</button>
        <button onClick={onSave} disabled={isSaving || cart.length === 0} style={{ flex: 2, padding: '14px', borderRadius: '12px', background: 'var(--accent-new)', border: 'none', color: 'white', fontWeight: '700' }}>
          {isSaving ? 'Saving...' : 'Review Order'}
        </button>
      </div>
    </div>
  </div>
);

export default OrderBuilder;
