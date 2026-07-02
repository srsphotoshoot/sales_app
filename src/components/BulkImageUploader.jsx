import React, { useState, useCallback } from 'react';
import { Upload, File, Folder, CheckCircle, X, Loader2 } from 'lucide-react';

const BulkImageUploader = ({ activeApiUrl, safeFetch, onComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const processEntries = async (items) => {
    const fileList = [];
    
    const readEntry = async (entry, path = '') => {
      if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve));
        if (file.type.startsWith('image/')) {
          // Store relative path in originalname for backend mapping
          const relativePath = path ? `${path}/${file.name}` : file.name;
          Object.defineProperty(file, 'originalname', {
            value: relativePath,
            writable: false
          });
          fileList.push(file);
        }
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise((resolve) => reader.readEntries(resolve));
        for (const child of entries) {
          await readEntry(child, path ? `${path}/${entry.name}` : entry.name);
        }
      }
    };

    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) await readEntry(entry);
    }
    
    return fileList;
  };

  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.items) {
      const entries = await processEntries(Array.from(e.dataTransfer.items));
      setFiles(prev => [...prev, ...entries]);
    }
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    
    // Upload in batches of 50 to avoid payload limits
    const batchSize = 50;
    let successCount = 0;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const formData = new FormData();
      
      batch.forEach((file) => {
        formData.append('images', file, file.originalname);
      });

      try {
        const res = await safeFetch('/api/products/bulk-images', {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        if (data.success) {
          successCount += (data.updatedCount || 0);
        }
      } catch (err) {
        console.error("Batch upload failed:", err);
      }
      setProgress({ current: Math.min(i + batchSize, files.length), total: files.length });
    }

    setUploading(false);
    alert(`✅ Bulk Processing Complete!\nAssociated ${successCount} product images.`);
    setFiles([]);
    if (onComplete) onComplete();
  };

  return (
    <div className="bulk-image-uploader">
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent-new)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '16px',
          padding: '40px 20px',
          textAlign: 'center',
          background: isDragging ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255,255,255,0.02)',
          transition: 'all 0.2s'
        }}
      >
        <Folder size={48} color={isDragging ? 'var(--accent-new)' : 'rgba(255,255,255,0.3)'} style={{ margin: '0 auto 15px' }} />
        <h4 style={{ marginBottom: '8px' }}>Drag & Drop Folders Here</h4>
        <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '20px' }}>
          Drop product folders (e.g. "8441/") or images (`8441_red.jpg`).<br/>
          We will automatically map them to your inventory items.
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '10px' }}>
          <button 
            type="button"
            onClick={() => document.getElementById('bulk-folder-upload').click()}
            style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--accent-new)', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-new)', fontWeight: '600', fontSize: '0.85rem' }}
          >
            Select Folders
          </button>
          <button 
            type="button"
            onClick={() => document.getElementById('bulk-file-upload').click()}
            style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'white', fontWeight: '600', fontSize: '0.85rem' }}
          >
            Select Images
          </button>
        </div>

        <input 
          id="bulk-folder-upload" 
          type="file" 
          webkitdirectory="" 
          directory="" 
          multiple 
          onChange={(e) => {
            const selectedFiles = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
            selectedFiles.forEach(f => {
              Object.defineProperty(f, 'originalname', { value: f.webkitRelativePath || f.name, writable: false });
            });
            setFiles(prev => [...prev, ...selectedFiles]);
          }} 
          style={{ display: 'none' }} 
        />
        
        <input 
          id="bulk-file-upload" 
          type="file" 
          multiple 
          accept="image/*"
          onChange={(e) => {
            const selectedFiles = Array.from(e.target.files);
            selectedFiles.forEach(f => {
              Object.defineProperty(f, 'originalname', { value: f.name, writable: false });
            });
            setFiles(prev => [...prev, ...selectedFiles]);
          }} 
          style={{ display: 'none' }} 
        />

        {files.length > 0 && !uploading && (
          <div style={{ marginTop: '20px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent-new)' }}>
              {files.length} images ready to map
            </span>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px' }}>
               <button onClick={() => setFiles([])} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'white' }}>Clear</button>
               <button onClick={handleUpload} className="action-btn" style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent-new)', color: 'white', fontWeight: 'bold' }}>Start Mapping</button>
            </div>
          </div>
        )}

        {uploading && (
          <div style={{ marginTop: '20px' }}>
            <Loader2 className="spinner" size={24} color="var(--accent-new)" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: '0.85rem' }}>Processing Batch: {progress.current} / {progress.total}</p>
            <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '10px', overflow: 'hidden' }}>
              <div style={{ width: `${(progress.current / progress.total) * 100}%`, height: '100%', background: 'var(--accent-new)', transition: 'width 0.3s' }}></div>
            </div>
          </div>
        )}
      </div>
      
      {files.length > 0 && !uploading && (
        <div style={{ marginTop: '15px', maxHeight: '150px', overflowY: 'auto', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
           {files.slice(0, 5).map((f, i) => (
             <div key={i} style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={10} color="var(--accent-new)" /> {f.originalname}
             </div>
           ))}
           {files.length > 5 && <div style={{ fontSize: '0.7rem', opacity: 0.3 }}>... and {files.length - 5} more</div>}
        </div>
      )}
    </div>
  );
};

export default BulkImageUploader;
