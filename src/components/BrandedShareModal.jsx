import React, { useState, useEffect, useRef } from 'react';
import { Share2, X, Download, Layout, CheckCircle, Loader2 } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { getAbsoluteImageUrl, fetchImageBlobUrl } from '../services/api';

const BrandedShareModal = ({ products, logoUrl, defaultPosition, onBack, activeApiUrl }) => {
  const [position, setPosition] = useState(defaultPosition || 'top-right');
  const [withLogo, setWithLogo] = useState(true);
  const [sharingIndex, setSharingIndex] = useState(-1); // -1: Ready, 0+: Sharing index
  const [isProcessing, setIsProcessing] = useState(false);
  const [failedProducts, setFailedProducts] = useState([]);
  const canvasRef = useRef(null);

  const drawAndShare = async (product) => {
    return new Promise(async (resolve) => {
      try {
        const productBlobUrl = await fetchImageBlobUrl(getAbsoluteImageUrl(product.imageUrl || product.images?.[0] || '', activeApiUrl));
        if (!productBlobUrl) {
          resolve({ success: false, product });
          return;
        }

        const img = new Image();
        img.src = productBlobUrl;

        img.onload = async () => {
          const canvas = canvasRef.current;
          if (!canvas) { resolve({ success: false }); return; }
          const ctx = canvas.getContext('2d');

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          if (withLogo && logoUrl) {
            const logoBlobUrl = await fetchImageBlobUrl(getAbsoluteImageUrl(logoUrl, activeApiUrl));
            if (logoBlobUrl) {
              const logo = new Image();
              logo.src = logoBlobUrl;
              logo.onload = async () => {
                const logoScale = (canvas.width * 0.15) / logo.width;
                const lw = logo.width * logoScale;
                const lh = logo.height * logoScale;
                const margin = canvas.width * 0.02;

                let lx, ly;
                switch (position) {
                  case 'top-left': lx = margin; ly = margin; break;
                  case 'top-right': lx = canvas.width - lw - margin; ly = margin; break;
                  case 'bottom-left': lx = margin; ly = canvas.height - lh - margin; break;
                  case 'bottom-right': lx = canvas.width - lw - margin; ly = canvas.height - lh - margin; break;
                  case 'center': lx = (canvas.width - lw) / 2; ly = (canvas.height - lh) / 2; break;
                  default: lx = canvas.width - lw - margin; ly = margin;
                }

                ctx.drawImage(logo, lx, ly, lw, lh);
                resolve(await executeShare(canvas, product));
              };
              logo.onerror = async () => {
                resolve(await executeShare(canvas, product));
              };
            } else {
              resolve(await executeShare(canvas, product));
            }
          } else {
            resolve(await executeShare(canvas, product));
          }
        };
        img.onerror = () => {
          console.error(`Failed to load image for ${product.name}`);
          resolve({ success: false, product });
        };
      } catch (err) {
        console.error("Draw fail:", err);
        resolve({ success: false, product });
      }
    });
  };

  const executeShare = async (canvas, product) => {
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const base64Data = dataUrl.split(',')[1];
      const fileName = `SHARE-${product.id}-${product.color || 'Gen'}.jpg`;

      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });

      await Share.share({
        title: `Share ${product.name}`,
        text: `Product: ${product.name} | Color: ${product.color} | Price: ₹${product.rate}`,
        url: savedFile.uri,
      });
      return { success: true };
    } catch (e) {
      console.error("Final share fail:", e);
      return { success: false, product };
    }
  };

  const startSharing = async () => {
    setIsProcessing(true);
    setFailedProducts([]);
    const failed = [];
    for (let i = 0; i < products.length; i++) {
      setSharingIndex(i);
      const result = await drawAndShare(products[i]);
      if (!result.success && result.product) {
        failed.push(result.product.name || `Item ${i + 1}`);
      }
    }
    setSharingIndex(-1);
    setIsProcessing(false);
    if (failed.length > 0) {
      setFailedProducts(failed);
      alert(`⚠️ ${failed.length} image(s) failed to share:\n${failed.join(', ')}\n\nCheck your connection and try again.`);
    } else {
      alert("✅ All products shared successfully!");
    }
  };

  return (
    <div className="share-modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.9)', zIndex: 3000, display: 'flex', flexDirection: 'column', padding: '20px'
    }}>
      <div className="card animate-slide-up" style={{ maxWidth: '500px', margin: 'auto', width: '100%', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3>Branded Product Share</h3>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'white' }}><X size={24}/></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', marginBottom: '24px' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Sharing {products.length} Products</p>
            <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>Images will be shared separately at highest quality.</p>
          </div>
          <Share2 size={32} color="var(--accent-new)" />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.9rem' }}>Include Brand Logo</span>
            <button 
                onClick={() => setWithLogo(!withLogo)}
                style={{ 
                    padding: '4px 12px', borderRadius: '20px', fontSize: '0.7rem', 
                    background: withLogo ? 'var(--accent-new)' : 'rgba(255,255,255,0.1)',
                    border: 'none', color: 'white'
                }}>
                {withLogo ? 'YES' : 'NO'}
            </button>
          </div>

          {withLogo && (
            <div>
              <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '8px' }}>Select Logo Position:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'].map(pos => (
                  <button 
                    key={pos}
                    onClick={() => setPosition(pos)}
                    style={{
                      padding: '8px', borderRadius: '8px', fontSize: '0.7rem', textTransform: 'capitalize',
                      background: position === pos ? 'var(--accent-new)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', color: 'white'
                    }}>
                    {pos.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {failedProducts.length > 0 && (
          <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.3)' }}>
            <p style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold', marginBottom: '4px' }}>Failed to share:</p>
            {failedProducts.map((name, i) => (
              <p key={i} style={{ fontSize: '0.75rem', color: '#fca5a5' }}>• {name}</p>
            ))}
          </div>
        )}

        <button
          onClick={startSharing}
          disabled={isProcessing}
          style={{
            width: '100%', padding: '16px', borderRadius: '12px', background: 'var(--accent-new)',
            color: 'white', fontWeight: 'bold', border: 'none', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '10px', fontSize: '1.1rem'
          }}>
          {isProcessing ? <Loader2 size={24} className="spinner" /> : <Share2 size={24} />}
          {isProcessing ? `Processing ${sharingIndex + 1}/${products.length}...` : 'Start Sharing'}
        </button>

        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      </div>
    </div>
  );
};

export default BrandedShareModal;
