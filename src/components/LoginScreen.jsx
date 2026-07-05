import React, { useState, useEffect } from 'react';
import { Smartphone, AlertCircle, Loader2 } from 'lucide-react';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { googleLogin } from '../services/api';

const LoginScreen = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    GoogleAuth.initialize();
  }, []);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const googleUser = await GoogleAuth.signIn();
      const { idToken, accessToken } = googleUser.authentication;
      const data = await googleLogin(idToken);
      onLogin(data.token, data.name, data.role, accessToken);
    } catch (err) {
      if (err?.message === 'popup_closed_by_user' || err?.message?.toLowerCase().includes('cancel')) {
        setError('Google sign-in was cancelled.');
      } else {
        setError(err.message || 'Sign-in failed. Ask Admin to add your email.');
      }
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
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          padding: '4px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <img
            src="/icon-512.png"
            alt="Logo"
            style={{ width: '100%', height: '100%', borderRadius: '20px', objectFit: 'cover' }}
          />
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '8px' }}>Internal Access</h2>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginBottom: '32px' }}>
          Sign in with the Google account your Admin registered for you.
        </p>

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
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            background: loading ? 'rgba(255,255,255,0.2)' : 'white',
            color: '#0f172a',
            border: 'none',
            fontSize: '1rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
          }}
        >
          {loading ? <Loader2 className="spinner" size={20} /> : (
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.3 29.4 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l6-6C33.7 6.5 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c2.8 0 5.3 1 7.3 2.7l6-6C33.7 6.5 29.1 4.5 24 4.5c-7.7 0-14.4 4.4-17.7 10.2z"/><path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.6 2.3-7.2 2.3-5.3 0-9.8-3.6-11.4-8.4l-6.5 5C9.5 39 16.2 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 5l6.2 5.2C40.7 35.7 43.5 30.2 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
          )}
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>

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
