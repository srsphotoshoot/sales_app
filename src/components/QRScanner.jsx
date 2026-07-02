import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, ScanLine, AlertCircle, Zap, ZapOff } from 'lucide-react';

const HELPER_ID = 'qr-file-decode-helper';

const QRScanner = ({ onScan, onClose, forceFlash = false }) => {
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | scanning | notfound
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!document.getElementById(HELPER_ID)) {
      const el = document.createElement('div');
      el.id = HELPER_ID;
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    startCamera();
    return () => stopCamera();
  }, []);

  // Flash the torch briefly when forceFlash pulses true
  useEffect(() => {
    if (forceFlash && streamRef.current) {
      applyTorch(true);
      const t = setTimeout(() => applyTorch(false), 200);
      return () => clearTimeout(t);
    }
  }, [forceFlash]);

  const applyTorch = async (enabled) => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: enabled }] });
      setTorchOn(enabled);
    } catch {} // Device doesn't support torch — silently ignore
  };

  const toggleTorch = () => applyTorch(!torchOn);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError('Camera access failed. Please allow camera permission and retry.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const decodeFromCanvas = async (canvas) => {
    // Primary: Native BarcodeDetector API (Android Chrome / Capacitor WebView — fast, no hang)
    if ('BarcodeDetector' in window) {
      try {
        const detector = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'ean_13', 'code_39', 'upc_a', 'upc_e', 'data_matrix', 'ean_8']
        });
        const results = await Promise.race([
          detector.detect(canvas),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
        ]);
        if (results && results.length > 0) return results[0].rawValue;
      } catch (e) {
        if (e.message !== 'timeout') console.warn('BarcodeDetector:', e.message);
      }
    }

    // Fallback: html5-qrcode scanFile with hard timeout
    try {
      const blob = await Promise.race([
        fetch(canvas.toDataURL('image/jpeg', 0.95)).then(r => r.blob()),
        new Promise((_, rej) => setTimeout(() => rej(new Error('blob timeout')), 2000))
      ]);
      const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });
      const decoder = new Html5Qrcode(HELPER_ID, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        verbose: false,
      });
      try {
        return await Promise.race([
          decoder.scanFile(file, false),
          new Promise((_, rej) => setTimeout(() => rej(new Error('scan timeout')), 5000))
        ]);
      } finally {
        try { decoder.clear(); } catch {}
      }
    } catch (e) {
      if (e.message !== 'scan timeout' && e.message !== 'blob timeout') {
        // html5-qrcode throws when no barcode found — that's expected
      }
      return null;
    }
  };

  const handleScan = async () => {
    if (busyRef.current || !videoRef.current) return;
    busyRef.current = true;
    setStatus('scanning');

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

      const snapshotDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const getSnapshot = async () => snapshotDataUrl;

      const decoded = await decodeFromCanvas(canvas);

      if (decoded) {
        stopCamera();
        onScan(decoded, getSnapshot);
      } else {
        setStatus('notfound');
        setTimeout(() => { setStatus('idle'); busyRef.current = false; }, 1400);
      }
    } catch {
      setStatus('notfound');
      setTimeout(() => { setStatus('idle'); busyRef.current = false; }, 1400);
    }
  };

  const notFound = status === 'notfound';
  const scanning = status === 'scanning';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#000', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(0,0,0,0.85)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScanLine size={20} color="#60a5fa" />
          <span style={{ color: 'white', fontWeight: '700', fontSize: '1rem' }}>Barcode Scanner</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={toggleTorch} style={{ background: torchOn ? 'rgba(250,204,21,0.2)' : 'rgba(255,255,255,0.1)', border: 'none', color: torchOn ? '#facc15' : 'rgba(255,255,255,0.5)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {torchOn ? <Zap size={18} /> : <ZapOff size={18} />}
          </button>
          <button onClick={() => { stopCamera(); onClose(); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Camera — fills all remaining height */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px', textAlign: 'center', gap: '16px' }}>
            <AlertCircle size={48} color="#ef4444" />
            <p style={{ color: '#fca5a5', fontSize: '0.95rem', fontWeight: '500' }}>{error}</p>
            <button onClick={() => { setError(null); startCamera(); }} style={{ padding: '10px 24px', borderRadius: '12px', background: '#ef4444', color: 'white', border: 'none', fontWeight: '700' }}>
              Retry
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* Targeting overlay */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30%', background: 'rgba(0,0,0,0.45)' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', background: 'rgba(0,0,0,0.45)' }} />

              <div style={{
                width: '82%', height: '22%',
                border: `2px solid ${notFound ? '#ef4444' : scanning ? '#22c55e' : 'rgba(255,255,255,0.3)'}`,
                borderRadius: '14px', position: 'relative', transition: 'border-color 0.2s',
                boxShadow: notFound ? '0 0 0 3px rgba(239,68,68,0.25)' : scanning ? '0 0 0 3px rgba(34,197,94,0.2)' : 'none',
              }}>
                {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
                  <div key={`${v}${h}`} style={{
                    position: 'absolute', width: '22px', height: '22px',
                    [v]: '-2px', [h]: '-2px',
                    borderTop: v==='top' ? `4px solid ${notFound?'#ef4444':'#3b82f6'}` : 'none',
                    borderBottom: v==='bottom' ? `4px solid ${notFound?'#ef4444':'#3b82f6'}` : 'none',
                    borderLeft: h==='left' ? `4px solid ${notFound?'#ef4444':'#3b82f6'}` : 'none',
                    borderRight: h==='right' ? `4px solid ${notFound?'#ef4444':'#3b82f6'}` : 'none',
                    borderTopLeftRadius: v==='top'&&h==='left'?'8px':0,
                    borderTopRightRadius: v==='top'&&h==='right'?'8px':0,
                    borderBottomLeftRadius: v==='bottom'&&h==='left'?'8px':0,
                    borderBottomRightRadius: v==='bottom'&&h==='right'?'8px':0,
                  }} />
                ))}
                {!scanning && !notFound && (
                  <div style={{ position: 'absolute', top: '50%', left: '4%', right: '4%', height: '2px', background: 'linear-gradient(90deg,transparent,#3b82f6,transparent)', animation: 'scanline 1.8s ease-in-out infinite' }} />
                )}
              </div>

              <p style={{
                marginTop: '18px', fontSize: '0.8rem', fontWeight: '600', letterSpacing: '0.04em',
                color: notFound ? '#f87171' : scanning ? '#4ade80' : 'rgba(255,255,255,0.65)',
                textShadow: '0 1px 4px rgba(0,0,0,0.8)', transition: 'color 0.2s',
              }}>
                {notFound ? 'Barcode not found — try again' : scanning ? 'Scanning...' : 'Position barcode inside the frame'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* TAP TO SCAN button */}
      {!error && (
        <div style={{ padding: '20px 24px 32px', background: 'rgba(0,0,0,0.9)', flexShrink: 0 }}>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              width: '100%', padding: '18px', borderRadius: '16px', fontSize: '1.05rem', fontWeight: '800',
              border: 'none', cursor: scanning ? 'default' : 'pointer',
              background: scanning ? 'rgba(59,130,246,0.2)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
              color: scanning ? 'rgba(255,255,255,0.4)' : 'white',
              letterSpacing: '0.05em', transition: 'all 0.15s',
              boxShadow: scanning ? 'none' : '0 8px 24px -6px rgba(59,130,246,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            }}
          >
            <ScanLine size={22} />
            {scanning ? 'Scanning...' : 'TAP TO SCAN'}
          </button>
        </div>
      )}

      <style>{`@keyframes scanline{0%,100%{transform:translateY(-10px);opacity:.3}50%{transform:translateY(10px);opacity:1}}`}</style>
    </div>
  );
};

export default QRScanner;
