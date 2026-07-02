import React from 'react';
import { Settings, RefreshCw, Upload, LayoutGrid } from 'lucide-react';
import { getAbsoluteImageUrl } from '../../services/api';
import AuthImage from '../AuthImage.jsx';

const BrandingSettings = ({ 
    branding, 
    onUpdateBranding, 
    onUploadLogo, 
    activeApiUrl,
    loading 
}) => {
    return (
        <div className="animate-fade-in">
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', borderRadius: '15px', padding: '20px', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '24px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}><Settings size={18}/> Share Watermark Logo</h4>
                <p style={{ fontSize: '0.75rem', opacity: 0.45, marginBottom: '20px' }}>This logo is stamped onto product images when sharing. It does not affect the app icon.</p>

                <div style={{ marginBottom: '25px' }}>
                    <label style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block', marginBottom: '10px' }}>Watermark Logo</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <AuthImage
                                src={branding.logoUrl ? getAbsoluteImageUrl(branding.logoUrl, activeApiUrl) : null}
                                alt="Watermark Logo"
                                style={{ maxWidth: '100%', maxHeight: '100%' }}
                                fallback={<LayoutGrid size={24} opacity={0.2} />}
                            />
                        </div>

                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '10px' }}>PNG with transparent background recommended. Size: 512x512px.</p>
                            <label className="action-btn" style={{ background: 'rgba(255,255,255,0.1)', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <Upload size={16} /> Select Logo
                                <input type="file" accept="image/*" onChange={(e) => onUploadLogo(e.target.files[0])} style={{ display: 'none' }} />
                            </label>
                        </div>
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block', marginBottom: '10px' }}>Watermark Position on Shared Image</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                        {['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'].map(pos => (
                            <button 
                                key={pos}
                                onClick={() => onUpdateBranding({ logoPosition: pos })}
                                style={{
                                    padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                                    background: branding.logoPosition === pos ? 'var(--accent-new)' : 'rgba(255,255,255,0.02)',
                                    color: 'white', fontSize: '0.8rem', fontWeight: 'bold'
                                }}
                            >
                                {pos.toUpperCase().replace('-', ' ')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BrandingSettings;
