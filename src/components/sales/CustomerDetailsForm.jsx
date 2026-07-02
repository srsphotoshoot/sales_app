import React from 'react';
import { User } from 'lucide-react';

const CustomerDetailsForm = ({ 
  customer, setCustomer, customerSearch, searchResults, searchCustomers, selectExistingCustomer, onContinue 
}) => (
  <div className="customer-form card animate-slide-up">
    <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <User size={20} color="var(--accent-new)" />
      Customer Details
    </h3>
    
    <div className="input-group" style={{ marginBottom: '16px', position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Search or Enter Name *</label>
      <input 
        type="text" 
        value={customer.name || customerSearch} 
        placeholder="Start typing name..."
        onChange={(e) => {
          const val = e.target.value;
          setCustomer({ ...customer, name: val });
          searchCustomers(val);
        }}
        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--primary-bg)', color: 'white' }}
      />
      {searchResults.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', borderRadius: '8px', zIndex: 10, border: '1px solid var(--glass-border)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', marginTop: '4px' }}>
          {searchResults.map((c, i) => (
            <div key={`${c.name}-${c.contact || i}`} onClick={() => selectExistingCustomer(c)} style={{ padding: '12px', borderBottom: i < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{c.name}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>GST: {c.gst || 'None'} • {c.contact || 'No contact'}</div>
            </div>
          ))}
        </div>
      )}
    </div>

    <div className="input-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
      <div className="input-group">
        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>GST Number</label>
        <input 
          type="text" 
          value={customer.gst || ''} 
          placeholder="Optional"
          onChange={(e) => setCustomer({...customer, gst: e.target.value.toUpperCase()})}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--primary-bg)', color: 'white' }}
        />
      </div>
      <div className="input-group">
        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Contact</label>
        <input 
          type="text" 
          value={customer.contact || ''} 
          placeholder="Optional"
          onChange={(e) => setCustomer({...customer, contact: e.target.value})}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--primary-bg)', color: 'white' }}
        />
      </div>
    </div>

    <div className="input-group" style={{ marginBottom: '24px' }}>
      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Address</label>
      <textarea 
        value={customer.address || ''} 
        placeholder="Optional"
        onChange={(e) => setCustomer({...customer, address: e.target.value})}
        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--primary-bg)', color: 'white', minHeight: '80px' }}
      />
    </div>

    <button 
      disabled={!customer.name?.trim()}
      onClick={onContinue}
      style={{
        width: '100%', padding: '16px', borderRadius: '12px', border: 'none',
        background: !customer.name?.trim() ? 'rgba(255,255,255,0.1)' : 'var(--accent-new)',
        color: !customer.name?.trim() ? 'var(--text-muted)' : 'white',
        fontWeight: '600'
      }}
    >
      Continue to Products
    </button>
  </div>
);

export default CustomerDetailsForm;
