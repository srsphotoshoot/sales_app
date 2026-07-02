import React from 'react';
import { Key, Check, Copy, RefreshCw } from 'lucide-react';

const KeyManagement = ({ 
    newKey, 
    activeKeys, 
    generateKey, 
    copyToClipboard, 
    copiedKey, 
    loading 
}) => {
    return (
        <div className="animate-fade-in">
            <div style={{ background: 'rgba(16, 185, 129, 0.05)', borderRadius: '15px', padding: '20px', border: '1px dashed rgba(16, 185, 129, 0.3)', marginBottom: '24px', textAlign: 'center' }}>
                <Key size={30} color="#10b981" style={{ margin: '0 auto 10px' }} />
                <h4>One-Time Access Key</h4>
                <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: '8px 0 20px' }}>Generate keys for new salesperson logins.</p>
                
                {newKey && (
                    <div style={{ background: 'white', color: '#0f172a', padding: '15px', borderRadius: '10px', fontSize: '1.5rem', fontWeight: '800', letterSpacing: '4px', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        {newKey}
                        <button onClick={() => copyToClipboard(newKey)} style={{ background: 'none', border: 'none', color: '#10b981' }}>
                            {copiedKey === newKey ? <Check size={20} /> : <Copy size={20} />}
                        </button>
                    </div>
                )}
                
                <button 
                    onClick={generateKey} 
                    disabled={loading}
                    className="action-btn" 
                    style={{ background: '#10b981', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '10px', fontWeight: '600' }}
                >
                    {loading ? <RefreshCw className="spinner" size={18} /> : 'Generate Key'}
                </button>
            </div>

            <h5 style={{ marginBottom: '12px', opacity: 0.6 }}>Active Unused Keys ({activeKeys.length})</h5>
            {activeKeys.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '15px', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                    <Key size={32} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                    No unused keys available.
                </div>
            ) : activeKeys.map(k => (
                <div key={k.key} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span>{k.key}</span>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>{k.createdAt ? new Date(k.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}</span>
                        <button onClick={() => copyToClipboard(k.key)} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.4 }}>
                            {copiedKey === k.key ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default KeyManagement;
