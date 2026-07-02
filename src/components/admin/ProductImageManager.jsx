import React, { useState, useMemo } from 'react';
import { Upload, Plus, Trash2, Image, X, Loader2, Save, Search, ChevronRight } from 'lucide-react';
import AuthImage from '../AuthImage.jsx';
import ImageLightbox from '../ImageLightbox.jsx';
import { getAbsoluteImageUrl } from '../../services/api';

const ProductImageManager = ({ products, activeApiUrl, safeFetch, onComplete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [variants, setVariants] = useState([]);
  // Each entry: { file, localUrl, color: string, showColorInput: bool }
  const [uploadFiles, setUploadFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [newColorInput, setNewColorInput] = useState('');
  const [addingVariant, setAddingVariant] = useState(false);

  const uniqueProducts = useMemo(() => {
    const seen = new Map();
    (products || []).forEach(p => {
      if (p.id && !seen.has(String(p.id))) {
        seen.set(String(p.id), { id: String(p.id), name: p.name, category: p.category || '' });
      }
    });
    return [...seen.values()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return uniqueProducts.slice(0, 25);
    const q = searchTerm.toLowerCase();
    return uniqueProducts.filter(p =>
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    ).slice(0, 25);
  }, [uniqueProducts, searchTerm]);

  const selectProduct = (id) => {
    setSelectedId(id);
    setSearchTerm('');
    setUploadFiles([]);
    setNewColorInput('');
    setAddingVariant(false);
    const vars = (products || []).filter(p => String(p.id) === String(id));
    setVariants(vars.map(v => ({
      ...v,
      images: Array.isArray(v.images) && v.images.length > 0
        ? [...v.images]
        : v.imageUrl ? [v.imageUrl] : [],
      _isNew: false,
      _isDeleted: false,
    })));
  };

  const handleFilesSelected = (files) => {
    setUploadFiles(prev => [
      ...prev,
      ...Array.from(files).map(file => ({
        file,
        localUrl: URL.createObjectURL(file),
        color: '',
        showColorInput: false,
      }))
    ]);
  };

  const assignColor = (i, value) => {
    setUploadFiles(prev => prev.map((f, idx) =>
      idx === i
        ? { ...f, color: value === '__new__' ? '' : value, showColorInput: value === '__new__' }
        : f
    ));
  };

  const setCustomColor = (i, value) => {
    setUploadFiles(prev => prev.map((f, idx) =>
      idx === i ? { ...f, color: value.toUpperCase() } : f
    ));
  };

  const removeUploadFile = (i) => {
    setUploadFiles(prev => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[i].localUrl);
      copy.splice(i, 1);
      return copy;
    });
  };

  const existingColors = variants.filter(v => !v._isDeleted).map(v => v.color.toUpperCase());

  const readyToUpload = uploadFiles.filter(f => f.color.trim() && !f.showColorInput);

  const uploadAndAssign = async () => {
    if (readyToUpload.length === 0) {
      alert('Assign a color to at least one image first.');
      return;
    }
    setIsUploading(true);
    const results = [];

    for (const f of readyToUpload) {
      const fd = new FormData();
      fd.append('image', f.file, f.file.name);
      try {
        const res = await safeFetch('/api/products/upload-image', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) results.push({ color: f.color.toUpperCase(), url: data.url });
      } catch (e) {
        console.error('Upload failed:', f.file.name, e);
      }
    }

    setVariants(prev => {
      const updated = prev.map(v => ({ ...v, images: [...v.images] }));
      for (const { color, url } of results) {
        const vi = updated.findIndex(v => v.color.toUpperCase() === color);
        if (vi !== -1) {
          if (!updated[vi].images.includes(url)) updated[vi].images.push(url);
        } else {
          const base = updated[0] || {};
          updated.push({
            uid: null,
            id: selectedId,
            name: base.name || selectedId,
            category: base.category || '',
            color,
            pcs: 0,
            rate: base.rate || 0,
            images: [url],
            imageUrl: url,
            _isNew: true,
            _isDeleted: false,
          });
        }
      }
      return updated;
    });

    // Remove successfully uploaded files (those that had a color assigned)
    const assignedLocalUrls = new Set(readyToUpload.map(f => f.localUrl));
    setUploadFiles(prev => {
      const remaining = prev.filter(f => !assignedLocalUrls.has(f.localUrl));
      return remaining;
    });

    setIsUploading(false);
    if (results.length < readyToUpload.length) {
      alert(`⚠️ ${results.length}/${readyToUpload.length} images uploaded. Some failed.`);
    }
  };

  const removeImageFromVariant = (vi, url) => {
    setVariants(prev => prev.map((v, i) =>
      i === vi ? { ...v, images: v.images.filter(u => u !== url) } : v
    ));
  };

  const toggleDeleteVariant = (vi) => {
    setVariants(prev => prev.map((v, i) =>
      i === vi ? { ...v, _isDeleted: !v._isDeleted } : v
    ));
  };

  const addNewVariant = () => {
    const color = newColorInput.trim().toUpperCase();
    if (!color) return;
    if (variants.find(v => v.color.toUpperCase() === color && !v._isDeleted)) {
      alert(`Color ${color} already exists.`);
      return;
    }
    const base = variants[0] || {};
    setVariants(prev => [...prev, {
      uid: null,
      id: selectedId,
      name: base.name || selectedId,
      category: base.category || '',
      color,
      pcs: 0,
      rate: base.rate || 0,
      images: [],
      imageUrl: '',
      _isNew: true,
      _isDeleted: false,
    }]);
    setNewColorInput('');
    setAddingVariant(false);
  };

  const saveChanges = async () => {
    if (!selectedId) return;
    if (uploadFiles.length > 0) {
      if (!window.confirm(`You have ${uploadFiles.length} unassigned image(s). Save without them?`)) return;
    }
    setIsSaving(true);
    try {
      const payload = variants.map(v => ({
        uid: v.uid || null,
        color: v.color,
        pcs: v.pcs,
        rate: v.rate,
        images: v.images,
        imageUrl: v.images[0] || '',
        isNew: v._isNew && !v._isDeleted,
        isDeleted: v._isDeleted && !v._isNew,
      }));

      const res = await safeFetch('/api/products/variants/save', {
        method: 'POST',
        body: JSON.stringify({ baseId: selectedId, variants: payload })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Saved successfully!');
        if (onComplete) onComplete();
        setSelectedId(null);
        setVariants([]);
        setUploadFiles([]);
      } else {
        alert('Save failed: ' + (data.message || 'Unknown error'));
      }
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (lightbox) {
    return (
      <ImageLightbox
        images={lightbox.images}
        initialIndex={lightbox.index}
        onClose={() => setLightbox(null)}
      />
    );
  }

  // ── Product Selection Screen ──
  if (!selectedId) {
    return (
      <div className="animate-fade-in">
        <h4 style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Image size={18} /> Product Image Manager
        </h4>
        <p style={{ fontSize: '0.78rem', opacity: 0.45, marginBottom: '20px' }}>
          Select a product to manage its color variants and images.
        </p>

        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by product ID or name..."
            style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
          />
          <Search size={16} style={{ position: 'absolute', left: 13, top: 14, opacity: 0.4 }} />
        </div>

        {filteredProducts.map(p => (
          <div
            key={p.id}
            onClick={() => selectProduct(p.id)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div>
              <div style={{ fontWeight: '600' }}>{p.name}</div>
              <div style={{ fontSize: '0.72rem', opacity: 0.45 }}>ID: {p.id}{p.category ? ` · ${p.category}` : ''}</div>
            </div>
            <ChevronRight size={18} style={{ opacity: 0.35 }} />
          </div>
        ))}

        {filteredProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', opacity: 0.3, fontSize: '0.9rem' }}>No products found</div>
        )}
      </div>
    );
  }

  // ── Product Management Screen ──
  const selectedInfo = uniqueProducts.find(p => p.id === selectedId);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
        <button
          onClick={() => { setSelectedId(null); setVariants([]); setUploadFiles([]); }}
          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'white', borderRadius: '8px', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <X size={16} />
        </button>
        <div>
          <div style={{ fontWeight: '700' }}>{selectedInfo?.name || selectedId}</div>
          <div style={{ fontSize: '0.72rem', opacity: 0.4 }}>ID: {selectedId}{selectedInfo?.category ? ` · ${selectedInfo.category}` : ''}</div>
        </div>
      </div>

      {/* Upload Section */}
      <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px dashed rgba(16,185,129,0.3)', borderRadius: '14px', padding: '16px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: uploadFiles.length > 0 ? '14px' : 0 }}>
          <h5 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
            <Upload size={15} /> Upload Images
          </h5>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: 'var(--accent-new)', color: 'white', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}>
            <Plus size={14} /> Select Files
            <input type="file" multiple accept="image/*" onChange={(e) => handleFilesSelected(e.target.files)} style={{ display: 'none' }} />
          </label>
        </div>

        {uploadFiles.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '12px' }}>
              {uploadFiles.map((f, i) => (
                <div key={i} style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '88px', position: 'relative', overflow: 'hidden' }}>
                    <img src={f.localUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={() => removeUploadFile(i)}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.72)', border: 'none', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div style={{ padding: '8px' }}>
                    <div style={{ fontSize: '0.68rem', opacity: 0.35, marginBottom: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</div>
                    <select
                      value={f.showColorInput ? '__new__' : (f.color || '')}
                      onChange={(e) => assignColor(i, e.target.value)}
                      style={{ width: '100%', padding: '5px 7px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: f.color ? 'white' : 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}
                    >
                      <option value="">— Assign color —</option>
                      {existingColors.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__new__">+ New color</option>
                    </select>
                    {f.showColorInput && (
                      <input
                        autoFocus
                        placeholder="Type color name..."
                        value={f.color}
                        onChange={(e) => setCustomColor(i, e.target.value)}
                        style={{ width: '100%', marginTop: '5px', padding: '5px 7px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(16,185,129,0.5)', color: 'white', fontSize: '0.75rem' }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={uploadAndAssign}
              disabled={isUploading || readyToUpload.length === 0}
              style={{ width: '100%', padding: '11px', borderRadius: '10px', background: isUploading || readyToUpload.length === 0 ? 'rgba(16,185,129,0.35)' : 'var(--accent-new)', border: 'none', color: 'white', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: readyToUpload.length === 0 ? 'default' : 'pointer' }}
            >
              {isUploading
                ? <><Loader2 size={16} className="spinner" /> Uploading...</>
                : <><Upload size={15} /> Upload &amp; Assign ({readyToUpload.length} of {uploadFiles.length})</>
              }
            </button>
          </>
        )}
      </div>

      {/* Variants */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h5 style={{ margin: 0, opacity: 0.7 }}>Color Variants ({variants.filter(v => !v._isDeleted).length})</h5>
      </div>

      {variants.map((v, vi) => (
        <div key={v.uid || v.color + vi} style={{
          background: v._isDeleted ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.03)',
          border: v._isDeleted ? '1px dashed rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.07)',
          borderRadius: '12px', padding: '13px', marginBottom: '10px',
          opacity: v._isDeleted ? 0.55 : 1
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: v.images.length > 0 ? '10px' : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(255,255,255,0.1)', padding: '3px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700' }}>{v.color}</span>
              {v._isNew && <span style={{ fontSize: '0.67rem', color: 'var(--accent-new)', background: 'rgba(16,185,129,0.15)', padding: '2px 7px', borderRadius: '20px' }}>NEW</span>}
              {v._isDeleted && <span style={{ fontSize: '0.67rem', color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '2px 7px', borderRadius: '20px' }}>WILL DELETE</span>}
              <span style={{ fontSize: '0.7rem', opacity: 0.35 }}>{v.images.length} image{v.images.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <label title={`Add more images to ${v.color}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '7px', background: 'rgba(255,255,255,0.07)', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Plus size={14} />
                <input type="file" multiple accept="image/*" onChange={(e) => {
                  const fileCount = e.target.files.length;
                  const colorToAssign = v.color;
                  handleFilesSelected(e.target.files);
                  // Pre-assign the color for these files (capture count/color before async microtask)
                  setTimeout(() => {
                    setUploadFiles(prev => prev.map((f, fi) => fi >= prev.length - fileCount ? { ...f, color: colorToAssign } : f));
                  }, 0);
                }} style={{ display: 'none' }} />
              </label>
              <button
                onClick={() => toggleDeleteVariant(vi)}
                style={{ background: 'none', border: 'none', color: v._isDeleted ? 'rgba(255,255,255,0.35)' : '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }}
                title={v._isDeleted ? 'Restore variant' : 'Remove this color variant'}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {v.images.length > 0 && (
            <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '3px' }}>
              {v.images.map((imgUrl, imgIdx) => (
                <div
                  key={imgIdx}
                  style={{ position: 'relative', flexShrink: 0, width: 66, height: 66, borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                  onClick={() => setLightbox({ images: v.images.map(u => getAbsoluteImageUrl(u, activeApiUrl)), index: imgIdx })}
                >
                  <AuthImage
                    src={getAbsoluteImageUrl(imgUrl, activeApiUrl)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    fallback={<div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}><Image size={18} /></div>}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImageFromVariant(vi, imgUrl); }}
                    style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.75)', border: 'none', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {v.images.length === 0 && !v._isDeleted && (
            <div style={{ fontSize: '0.73rem', opacity: 0.28, paddingTop: '6px' }}>
              No images — upload above and assign to {v.color}
            </div>
          )}
        </div>
      ))}

      {/* Add New Color Variant */}
      {!addingVariant ? (
        <button
          onClick={() => setAddingVariant(true)}
          style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', marginBottom: '20px' }}
        >
          <Plus size={15} /> Add New Color Variant
        </button>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <input
            autoFocus
            value={newColorInput}
            onChange={(e) => setNewColorInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') addNewVariant(); if (e.key === 'Escape') setAddingVariant(false); }}
            placeholder="Color name (e.g. GREEN)"
            style={{ flex: 1, padding: '10px 13px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--accent-new)', color: 'white' }}
          />
          <button onClick={addNewVariant} style={{ padding: '10px 16px', borderRadius: '10px', background: 'var(--accent-new)', border: 'none', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Add</button>
          <button onClick={() => setAddingVariant(false)} style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Save */}
      <button
        onClick={saveChanges}
        disabled={isSaving}
        style={{ width: '100%', padding: '15px', borderRadius: '12px', background: isSaving ? 'rgba(16,185,129,0.4)' : 'var(--accent-new)', border: 'none', color: 'white', fontWeight: '700', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: isSaving ? 'default' : 'pointer' }}
      >
        {isSaving ? <><Loader2 size={19} className="spinner" /> Saving...</> : <><Save size={19} /> Save Changes</>}
      </button>
    </div>
  );
};

export default ProductImageManager;
