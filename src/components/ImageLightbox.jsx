import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import AuthImage from './AuthImage.jsx';

const ImageLightbox = ({ images, initialIndex = 0, onClose }) => {
  const [current, setCurrent] = useState(initialIndex);
  const touchStartX = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const go = (dir) => setCurrent(i => (i + dir + images.length) % images.length);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) go(diff < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)', zIndex: 5000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, cursor: 'pointer' }}
      >
        <X size={22} />
      </button>

      {images.length > 1 && (
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', pointerEvents: 'none' }}>
          {current + 1} / {images.length}
        </div>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ maxWidth: '92vw', maxHeight: '82vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <AuthImage
          src={images[current]}
          alt=""
          style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: '8px', display: 'block' }}
          fallback={<div style={{ color: 'rgba(255,255,255,0.3)', padding: '40px', textAlign: 'center' }}>Image not available</div>}
        />
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ChevronLeft size={26} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); go(1); }}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ChevronRight size={26} />
          </button>

          <div style={{ display: 'flex', gap: '6px', position: 'absolute', bottom: '24px' }}>
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                style={{ width: i === current ? 22 : 8, height: 8, borderRadius: 4, background: i === current ? 'var(--accent-new)' : 'rgba(255,255,255,0.3)', border: 'none', transition: 'all 0.2s', cursor: 'pointer', padding: 0 }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ImageLightbox;
