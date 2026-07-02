import React from 'react';
import { Sparkles, RefreshCw, Save, Globe } from 'lucide-react';

const SystemSettings = ({ 
    hubStatus, 
    manualHubUrl, 
    setManualHubUrl, 
    onSaveHubUrl, 
    onCheckConnection, 
    isCheckingHub 
}) => {
    return (
        <div className="animate-fade-in">
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', borderRadius: '20px', padding: '25px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px' }}>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                        <Globe size={24} />
                    </div>
                    <div>
                        <h4 style={{ margin: 0 }}>Central Hub Connection</h4>
                        <p style={{ fontSize: '0.75rem', opacity: 0.5, margin: 0 }}>Configure real-time data synchronization</p>
                    </div>
                </div>

                <div style={{ marginBottom: '25px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', opacity: 0.6, display: 'block', marginBottom: '10px' }}>Hub API URL</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input 
                            type="text" 
                            value={manualHubUrl}
                            onChange={(e) => setManualHubUrl(e.target.value)}
                            placeholder="https://your-hub-url.ngrok.app"
                            style={{ flex: 1, padding: '12px 15px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.9rem' }}
                        />
                        <button 
                            onClick={onSaveHubUrl}
                            style={{ padding: '12px', borderRadius: '12px', background: 'var(--accent-new)', border: 'none', color: 'white' }}
                        >
                            <Save size={20} />
                        </button>
                    </div>
                    <p style={{ fontSize: '0.65rem', opacity: 0.4, marginTop: '8px' }}>This URL connects your app to the Shree Radha Studio central database.</p>
                </div>

                <div style={{ padding: '15px', borderRadius: '15px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: hubStatus === 'online' ? '#10b981' : '#ef4444' }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Status: {hubStatus.toUpperCase()}</span>
                    </div>
                    <button 
                        onClick={onCheckConnection}
                        disabled={isCheckingHub}
                        style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <RefreshCw size={14} className={isCheckingHub ? "spinner" : ""} /> Retry Ping
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SystemSettings;
