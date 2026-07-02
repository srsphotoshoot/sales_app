import React, { useRef } from 'react';
import { FileUp, FileDown, CheckCircle, RefreshCw } from 'lucide-react';

const BulkUploadPanel = ({
    onDownloadTemplate,
    onHandleBulkUpload,
    bulkUploadSummary,
    onConfirmBulkUpload,
    onCancel,
    isBulkProcessing,
    loading
}) => {
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        onHandleBulkUpload(e);
        // Reset so the same file can be re-selected after cancel
        requestAnimationFrame(() => { if (fileInputRef.current) fileInputRef.current.value = ''; });
    };

    return (
        <div className="animate-fade-in">
            {!bulkUploadSummary ? (
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', borderRadius: '15px', padding: '30px', textAlign: 'center', border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                    <FileUp size={48} style={{ margin: '0 auto 20px', opacity: 0.2, display: 'block' }} />
                    <h4 style={{ marginBottom: '10px' }}>Bulk Inventory Upload</h4>
                    <p style={{ fontSize: '0.85rem', opacity: 0.5, marginBottom: '25px', maxWidth: '300px', margin: '0 auto 25px' }}>
                        Upload an Excel file to add or update multiple products at once.
                    </p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <label className="action-btn" style={{ background: 'var(--accent-new)', color: 'white', padding: '15px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {loading ? <RefreshCw className="spinner" size={20} /> : 'Select Excel File'}
                            <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} style={{ display: 'none' }} />
                        </label>
                        
                        <button 
                            onClick={onDownloadTemplate}
                            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '12px', borderRadius: '12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <FileDown size={14} /> Download Template
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ background: 'rgba(16, 185, 129, 0.05)', borderRadius: '15px', padding: '25px', border: '1px solid #10b981' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <CheckCircle color="#10b981" size={24} />
                        <h4 style={{ margin: 0 }}>File Analyzed</h4>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>New Products</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{bulkUploadSummary.newCount}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Updates</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{bulkUploadSummary.updateCount}</div>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white' }}>Cancel</button>
                        <button 
                            onClick={onConfirmBulkUpload} 
                            disabled={isBulkProcessing}
                            style={{ flex: 2, padding: '12px', borderRadius: '10px', background: '#10b981', border: 'none', color: 'white', fontWeight: 'bold' }}
                        >
                            {isBulkProcessing ? 'Processing...' : `Upload ${bulkUploadSummary.total} Items`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BulkUploadPanel;
