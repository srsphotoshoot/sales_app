import React, { useState } from 'react';
import { Lock, Smartphone, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';

const LoginScreen = ({ onLogin, activeApiUrl, onAdminRequest }) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const clickRef = React.useRef(0);
  const lastClickRef = React.useRef(0);

  const handleIconClick = () => {
    const now = Date.now();
    // Relaxed timing to 800ms for mobile taps
    if (now - lastClickRef.current < 800) {
      clickRef.current += 1;
    } else {
      clickRef.current = 1;
    }
    lastClickRef.current = now;
    if (clickRef.current >= 5) {
      onAdminRequest();
      clickRef.current = 0;
    }
  };

  const handleSubmit = async (e, overridePin = null) => {
    if (e) e.preventDefault();
    const currentPin = overridePin || pin;
    
    if (!currentPin) {
      setError('Please enter a code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const endpoint = '/api/auth/verify-staff';
      const apiBase = activeApiUrl || import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ code: currentPin })
      });

      const data = await response.json();

      if (data.success) {
        onLogin(data.sessionToken, data.name || '');
      } else {
        setError(data.message || 'Invalid code. Please ask Admin for access.');
      }
    } catch (err) {
      setError(`SRS Backend is offline. Please check your connection or contact Admin.`);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="login-overlay" style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '24px',
      color: 'white'
    }}>
      <div className="glass-card animate-zoom-in" style={{
        width: '100%',
        maxWidth: '400px',
        padding: '32px',
        borderRadius: '24px',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        textAlign: 'center'
      }}>
        <div 
          onClick={handleIconClick}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '24px',
            background: 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            padding: '4px',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <img 
            src="/icon-512.png" 
            alt="Logo" 
            style={{ width: '100%', height: '100%', borderRadius: '20px', objectFit: 'cover' }} 
          />
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '8px' }}>Internal Access</h2>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginBottom: '32px' }}>
          Please enter your Permanent Staff Code provided by the administrator.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Enter Staff Code"
              value={pin}
              onChange={(e) => setPin(e.target.value.toUpperCase())}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                fontSize: '1.2rem',
                textAlign: 'center',
                outline: 'none',
                transition: 'all 0.3s'
              }}
              autoFocus
            />
          </div>

          {error && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              color: '#ef4444', 
              fontSize: '0.85rem', 
              marginBottom: '20px',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '12px',
              borderRadius: '8px',
              textAlign: 'left'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pin}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '12px',
              background: loading ? 'rgba(16, 185, 129, 0.5)' : '#10b981',
              color: 'white',
              border: 'none',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: pin ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
            }}
          >
            {loading ? <Loader2 className="spinner" size={20} /> : 'Unlock App'}
            {!loading && <ChevronRight size={20} />}
          </button>
        </form>



        <div style={{ marginTop: '32px', color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <Smartphone size={14} />
            <span>Authorized Device Only</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
