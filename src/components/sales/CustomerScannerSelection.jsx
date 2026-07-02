import React from 'react';
import { Plus, QrCode } from 'lucide-react';

const CustomerScannerSelection = ({ onScanClick, onSkipClick }) => (
  <div className="card animate-zoom-in" style={{ padding: '40px 20px', textAlign: 'center' }}>
    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--accent-new)' }}>
      <Plus size={40} />
    </div>
    <h3 style={{ marginBottom: '10px' }}>Step 1: Customer Info</h3>
    <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Scan a card to start.</p>
    <button onClick={onScanClick} className="action-btn" style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: 'var(--accent-new)', color: 'white', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
      <QrCode size={20} />
      Scan Visiting Card
    </button>
    <button onClick={onSkipClick} style={{ marginTop: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'underline' }}>
      Skip to Manual Entry
    </button>
  </div>
);

export default CustomerScannerSelection;
