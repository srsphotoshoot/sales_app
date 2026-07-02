import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera as LucideCamera, Upload, Loader2, X, Check, ArrowRight, User, FileText, Phone, MapPin, Image as ImageIcon } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Ocr } from '@capacitor-community/image-to-text';
import { Capacitor } from '@capacitor/core';

const OCRScanner = ({ onExtract, onClose, mode = 'customer', initialImage = null }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedLines, setExtractedLines] = useState([]);
  const [capturedImage, setCapturedImage] = useState(null);

  // Dynamic State based on mode
  const [customer, setCustomer] = useState({ name: '', gst: '', contact: '', address: '' });
  const [product, setProduct] = useState({ id: '', name: '', compulsoryData: '', rate: '', colors: [] });
  const [activeField, setActiveField] = useState(mode === 'customer' ? 'name' : 'id');

  const COLOR_LIST = ['PINK', 'FIROZI', 'GOLD', 'WHITE', 'BLACK', 'RED', 'BLUE', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'BROWN', 'GREY', 'NAVY', 'MEHNDI', 'PISTA', 'ONION', 'RANI', 'LAVENDER', 'MUSTARD', 'TEAL'];

  const [canCapture, setCanCapture] = useState(false);

  useEffect(() => {
    if (initialImage) {
      setCapturedImage(initialImage);
      handleExtract(null, initialImage);
    }

    // Wait for previous camera resources to fully release
    const timer = setTimeout(() => {
      setCanCapture(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [initialImage]);

  const capturePhoto = async (source = CameraSource.Camera) => {
    if (!canCapture) return;
    try {
      // Explicitly check/request permissions before taking photo to avoid mid-operation crashes
      const permissions = await Camera.requestPermissions();
      if (permissions.camera !== 'granted' && source === CameraSource.Camera) {
        alert("Camera permission is required to scan cards.");
        return;
      }

      const image = await Camera.getPhoto({
        quality: 100,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: source
      });

      if (image.path) {
        // For preview, we still need a URL. For OCR, we use the path.
        const previewUrl = Capacitor.convertFileSrc(image.path);
        setCapturedImage(previewUrl);
        handleExtract(image.path, previewUrl);
      }
    } catch (error) {
      console.error('Camera Error:', error);
      if (error.message !== 'User cancelled photos app') {
        alert('Could not access camera/gallery: ' + error.message);
      }
    }
  };

  const handleExtract = async (imagePath, previewUrl) => {
    setLoading(true);
    setProgress(5);

    // Short delay to allow the camera picker to fully close and free up some native memory
    await new Promise(resolve => setTimeout(resolve, 800));
    setProgress(15);

    let extractedTextLines = [];
    let success = false;

    if (imagePath) {
      try {
        const { textDetections } = await Ocr.detectText({ filename: imagePath });
        if (textDetections && textDetections.length > 0) {
          extractedTextLines = textDetections.map(d => d.text.trim()).filter(text => text.length > 1);
          success = true;
          setProgress(100);
        }
      } catch (error) {
        console.error('Native OCR Error:', error);
      }
    }

    if (success && extractedTextLines.length > 0) {
      setExtractedLines(extractedTextLines);
      if (mode === 'customer') {
        const parsedCustomer = parseVisitingCard(extractedTextLines);
        setCustomer(parsedCustomer);
      } else {
        const parsedProduct = parseProductLabel(extractedTextLines);
        setProduct(parsedProduct);
        // We removed the auto-confirm jump to allow the user to see and verify the data
        // exactly like in the working Sales process.
      }
    } else {
      alert("No text detected. Please ensure the label is clear.");
    }

    setLoading(false);
    setProgress(0);
  };


  const parseVisitingCard = (lines) => {
    let name = '';
    let gst = '';
    let contact = '';
    const gstRegex = /\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}/i;
    const phoneRegex = /(\+91|0)?[6-9]\d{9}|(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!name && cleanLine.length > 3 && !cleanLine.match(/\d/) && !cleanLine.includes('@')) {
        name = cleanLine;
      }
      const gstMatch = cleanLine.match(gstRegex);
      if (gstMatch && !gst) gst = gstMatch[0].toUpperCase();
      const phoneMatch = cleanLine.match(phoneRegex);
      if (phoneMatch && !contact) contact = phoneMatch[0].replace(/\s/g, '');
    });
    return { name, gst, contact, address: '' };
  };

  const parseProductLabel = (lines) => {
    let id = '';
    let name = '';
    let compulsoryData = '';
    let rate = '';
    let detectedColors = [];
    
    // More flexible Regex for SRS formats - look for any long numeric string
    const idRegex = /(\d{4,6})/;
    const dataRegex = /(\d{8,12})/;

    lines.forEach((line) => {
        // Clean line of extreme noise but keep digits
        const rawLine = line.trim().toUpperCase();
        const upperLine = rawLine.replace(/\s/g, ''); 
      
      // 1. Auto-detect Compulsory Data (8-12 digits)
      const dataMatch = upperLine.match(dataRegex);
      if (dataMatch && !compulsoryData) {
        compulsoryData = dataMatch[1];
        
        // 2. EXTRACTION LOGIC: Skip 2, Take 4
        // Formula: Digit at index 2 to 6
        if (compulsoryData.length >= 6) {
          rate = compulsoryData.substring(2, 6);
        }
      }

      // 3. Auto-detect 4-6 digit ID
      const idMatch = upperLine.match(idRegex);
      if (idMatch && !id) {
        // Ensure we don't pick the same number as compulsory data
        if (idMatch[1] !== compulsoryData) {
          id = idMatch[1];
          name = idMatch[1];
        }
      }

      // 4. Auto-detect Colors
      COLOR_LIST.forEach(color => {
        if (upperLine.includes(color) && !detectedColors.includes(color)) {
          detectedColors.push(color);
        }
      });
    });

    // Fallback for ID if not found
    if (!id && compulsoryData && compulsoryData.length >= 4) {
       id = compulsoryData.substring(0, 4);
       name = id;
    }

    return { id, name, compulsoryData, rate, colors: detectedColors };
  };

  const clearData = () => {
    if (mode === 'customer') {
      setCustomer({ name: '', gst: '', contact: '', address: '' });
      setActiveField('name');
    } else {
      setProduct({ id: '', name: '', compulsoryData: '', rate: '', colors: [] });
      setActiveField('id');
    }
  };

  const handleLineClick = (text) => {
    if (mode === 'customer') {
      setCustomer(prev => ({
        ...prev,
        [activeField]: activeField === 'address' ? (prev.address ? `${prev.address}, ${text}` : text) : text
      }));
      if (activeField === 'name') setActiveField('gst');
      else if (activeField === 'gst') setActiveField('contact');
      else if (activeField === 'contact') setActiveField('address');
    } else {
      if (activeField === 'colors') {
        setProduct(prev => ({ ...prev, colors: [...new Set([...prev.colors, text.toUpperCase()])] }));
      } else if (activeField === 'compulsoryData') {
        const cleanText = text.replace(/\s/g, '');
        const dataMatch = cleanText.match(/(\d{8,12})/);
        const finalData = dataMatch ? dataMatch[1] : cleanText;
        const newRate = finalData.length >= 6 ? finalData.substring(2, 6) : product.rate;
        setProduct(prev => ({ ...prev, compulsoryData: finalData, rate: newRate }));
        setActiveField('colors');
      } else {
        setProduct(prev => ({ ...prev, [activeField]: text }));
        if (activeField === 'id') setActiveField('name');
        else if (activeField === 'name') setActiveField('compulsoryData');
      }
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCapturedImage(reader.result);
        handleExtract(null, reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = () => {
    onExtract(mode === 'customer' ? customer : product);
  };

  return (
    <div className="ocr-scanner-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.98)', display: 'flex', flexDirection: 'column',
      zIndex: 9000, color: 'white', overflowY: 'auto'
    }}>
      <div className="scanner-header" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)' }}>
        <h2 style={{ fontSize: '1.2rem' }}>Interactive OCR</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white' }}><X size={28} /></button>
      </div>

      {!capturedImage && !loading ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div className="card" style={{ padding: '30px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '24px' }}>
              <div style={{ padding: '15px', borderRadius: '15px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-new)' }}>
                <LucideCamera size={40} />
              </div>
              <div style={{ padding: '15px', borderRadius: '15px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                <ImageIcon size={40} />
              </div>
            </div>
            <h3 style={{ marginBottom: '8px' }}>{mode === 'customer' ? 'Add Customer Info' : 'Scan Product Label'}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px', fontSize: '0.85rem' }}>{mode === 'customer' ? 'Scan a visiting card via camera or upload from gallery.' : 'Point camera at the sticker/banner text to extract details.'}</p>

            {!canCapture ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <Loader2 className="spinner" style={{ margin: '0 auto 10px', color: 'var(--accent-new)' }} />
                <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>Preparing hardware scanner...</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  onClick={() => capturePhoto(CameraSource.Camera)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '20px', borderRadius: '15px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', color: 'white' }}
                >
                  <LucideCamera size={24} color="var(--accent-new)" />
                  <span style={{ fontSize: '0.8rem' }}>Open Camera</span>
                </button>
                <button
                  onClick={() => capturePhoto(CameraSource.Photos)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '20px', borderRadius: '15px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', color: 'white' }}
                >
                  <ImageIcon size={24} color="var(--accent-new)" />
                  <span style={{ fontSize: '0.8rem' }}>From Gallery</span>
                </button>
              </div>
            )}

            <button
              onClick={() => onExtract(mode === 'customer' ? { name: '', gst: '', contact: '', address: '' } : { id: '', name: '', compulsoryData: '', colors: [] })}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '10px' }}
            >
              Skip to Manual Entry
            </button>
          </div>
        </div>
      ) : loading ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <Loader2 className="spinner" size={48} color="var(--accent-new)" />
          <p style={{ marginTop: '20px' }}>Analyzing... {progress}%</p>
        </div>
      ) : (
        <div className="interactive-container" style={{ padding: '20px' }}>
          {/* Target Fields Selection */}
          <div className="field-selectors" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {mode === 'customer' ? (
              ['name', 'gst', 'contact', 'address'].map(field => (
                <div
                  key={field}
                  style={{
                    padding: '8px 12px', borderRadius: '10px', border: activeField === field ? '2px solid var(--accent-new)' : '1px solid var(--glass-border)',
                    background: activeField === field ? 'rgba(16, 185, 129, 0.1)' : 'var(--secondary-bg)',
                    display: 'flex', flexDirection: 'column', alignItems: 'start', cursor: 'pointer'
                  }}
                  onClick={() => setActiveField(field)}
                >
                  <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '4px', color: 'var(--text-muted)' }}>{field}</label>
                  <input
                    value={customer[field]}
                    onChange={(e) => setCustomer(prev => ({ ...prev, [field]: e.target.value }))}
                    placeholder="Tap text..."
                    style={{ 
                      background: 'transparent', border: 'none', color: 'white', fontSize: '0.85rem', 
                      fontWeight: '600', width: '100%', outline: 'none', padding: 0
                    }}
                  />
                </div>
              ))
            ) : (
              ['id', 'name', 'compulsoryData', 'rate', 'colors'].map(field => (
                <div
                  key={field}
                  style={{
                    padding: '8px 12px', borderRadius: '10px', border: activeField === field ? '2px solid var(--accent-new)' : '1px solid var(--glass-border)',
                    background: activeField === field ? 'rgba(16, 185, 129, 0.1)' : 'var(--secondary-bg)',
                    display: 'flex', flexDirection: 'column', alignItems: 'start', cursor: 'pointer'
                  }}
                  onClick={() => setActiveField(field)}
                >
                  <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '4px', color: 'var(--text-muted)' }}>{field === 'compulsoryData' ? 'Compulsory' : field}</label>
                  <input
                    value={Array.isArray(product[field]) ? product[field].join(', ') : product[field]}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (field === 'colors') {
                        setProduct(prev => ({ ...prev, colors: val.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) }));
                      } else if (field === 'compulsoryData') {
                        const cleanVal = val.replace(/\D/g, '');
                        const newRate = cleanVal.length >= 6 ? cleanVal.substring(2, 6) : product.rate;
                        setProduct(prev => ({ ...prev, compulsoryData: val, rate: newRate }));
                      } else {
                        setProduct(prev => ({ ...prev, [field]: val }));
                      }
                    }}
                    placeholder="Tap text..."
                    style={{ 
                      background: 'transparent', border: 'none', color: 'white', fontSize: '0.85rem', 
                      fontWeight: '600', width: '100%', outline: 'none', padding: 0
                    }}
                  />
                </div>
              ))
            )}
          </div>

          <div style={{ marginBottom: '10px', fontSize: '0.85rem', color: 'var(--accent-new)', fontWeight: '600', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>STEP: Tap the {activeField.toUpperCase()} text below</span>
            <button onClick={clearData} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem' }}>Clear All</button>
          </div>

          <div className="text-fragments" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            {extractedLines.map((line, idx) => (
              <button
                key={idx}
                onClick={() => handleLineClick(line)}
                style={{
                  textAlign: 'left', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)',
                  background: 'var(--secondary-bg)', color: 'white', fontSize: '0.9rem'
                }}
              >
                {line}
              </button>
            ))}
          </div>

          <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { setCapturedImage(null); setExtractedLines([]); }}
              style={{ flex: 1, padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'white' }}
            >
              Retake
            </button>
            <button
              onClick={handleConfirm}
              style={{ flex: 2, padding: '16px', borderRadius: '12px', border: 'none', background: 'var(--accent-new)', color: 'white', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Check size={20} />
              Save Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


export default OCRScanner;
