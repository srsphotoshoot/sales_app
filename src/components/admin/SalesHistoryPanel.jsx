import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Heart, ChevronDown, ChevronUp, Trash2, FileDown, CheckCircle, Clock, Loader2 } from 'lucide-react';

const STORAGE_KEY = 'srs_downloaded_orders';

function getDownloaded() {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
    catch { return new Set(); }
}
function markDownloaded(orderId) {
    const set = getDownloaded();
    set.add(orderId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

const SalesHistoryPanel = ({
    salesHistory,
    onDeleteOrder,
    onGeneratePdf,
    type = 'sale'
}) => {
    const [expandedOrder, setExpandedOrder] = useState(null);
    const [downloaded, setDownloaded] = useState(getDownloaded);
    const [bulkProgress, setBulkProgress] = useState(null); // null | { done, total }

    useEffect(() => { setDownloaded(getDownloaded()); }, []);

    const filteredHistory = salesHistory.filter(order => {
        if (type === 'interest') {
            return order.cart && order.cart.some(item => item.type === 'interest');
        }
        return order.cart && order.cart.some(item => !item.type || item.type === 'sale');
    });

    const handlePdf = useCallback(async (order, pdfType) => {
        try {
            await onGeneratePdf(order, pdfType);
            markDownloaded(order.orderId);
            setDownloaded(getDownloaded());
        } catch (err) {
            const msg = (err?.message || '').toLowerCase();
            if (msg.includes('cancel') || msg.includes('dismiss') || msg.includes('abort')) return;
            if (msg.includes('permission') || msg.includes('denied')) {
                alert('Storage permission denied. Enable storage permission in app settings.');
            } else {
                alert('PDF generation failed. Please try again.');
            }
        }
    }, [onGeneratePdf]);

    const handleDownloadAll = useCallback(async () => {
        if (bulkProgress) return;
        const pending = filteredHistory.filter(o => !downloaded.has(o.orderId));
        if (pending.length === 0) { alert('All order PDFs have already been downloaded.'); return; }
        setBulkProgress({ done: 0, total: pending.length });
        for (let i = 0; i < pending.length; i++) {
            await handlePdf(pending[i], 'receipt');
            setBulkProgress({ done: i + 1, total: pending.length });
            // Small gap between PDFs to avoid native share sheet conflicts
            await new Promise(r => setTimeout(r, 800));
        }
        setBulkProgress(null);
    }, [filteredHistory, downloaded, bulkProgress, handlePdf]);

    const pendingCount = filteredHistory.filter(o => !downloaded.has(o.orderId)).length;
    const doneCount = filteredHistory.length - pendingCount;

    return (
        <div className="animate-fade-in">
            {filteredHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', opacity: 0.2 }}>
                    {type === 'interest'
                        ? <Heart size={48} style={{ margin: '0 auto 15px', display: 'block' }} />
                        : <ShoppingCart size={48} style={{ margin: '0 auto 15px', display: 'block' }} />}
                    <p>No {type === 'interest' ? 'interests' : 'sales'} recorded yet.</p>
                </div>
            ) : (
                <>
                    {/* Stats + Bulk Download */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10b981' }}>
                                <CheckCircle size={14} /> {doneCount} Downloaded
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f59e0b' }}>
                                <Clock size={14} /> {pendingCount} Pending
                            </span>
                        </div>
                        <button
                            onClick={handleDownloadAll}
                            disabled={!!bulkProgress || pendingCount === 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '10px', border: 'none',
                                background: bulkProgress || pendingCount === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.15)',
                                color: bulkProgress || pendingCount === 0 ? 'rgba(255,255,255,0.3)' : '#10b981',
                                fontWeight: '700', fontSize: '0.8rem', cursor: pendingCount === 0 ? 'default' : 'pointer'
                            }}
                        >
                            {bulkProgress
                                ? <><Loader2 size={14} className="spinner" /> {bulkProgress.done}/{bulkProgress.total}</>
                                : <><FileDown size={14} /> Download All</>}
                        </button>
                    </div>

                    {filteredHistory.map(order => {
                        const isDownloaded = downloaded.has(order.orderId);
                        return (
                            <div
                                key={order.orderId}
                                style={{
                                    borderRadius: '15px',
                                    border: isDownloaded
                                        ? '1px solid rgba(16,185,129,0.35)'
                                        : '1px solid rgba(245,158,11,0.3)',
                                    background: isDownloaded
                                        ? 'rgba(16,185,129,0.04)'
                                        : 'rgba(245,158,11,0.04)',
                                    marginBottom: '12px', overflow: 'hidden'
                                }}
                            >
                                <div
                                    onClick={() => setExpandedOrder(expandedOrder === order.orderId ? null : order.orderId)}
                                    style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{order.customer.name}</div>
                                        <div style={{ fontSize: '0.72rem', opacity: 0.45 }}>
                                            {new Date(order.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} | {order.orderId}
                                        </div>
                                        {order.createdBy && (
                                            <div style={{ fontSize: '0.7rem', opacity: 0.35, marginTop: '2px' }}>by {order.createdBy}</div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ color: 'var(--accent-new)', fontWeight: 'bold' }}>₹{order.totalValue}</div>
                                            <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{order.totalItems} Items</div>
                                        </div>
                                        {isDownloaded
                                            ? <CheckCircle size={18} color="#10b981" />
                                            : <Clock size={18} color="#f59e0b" />}
                                        {expandedOrder === order.orderId ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </div>

                                {expandedOrder === order.orderId && (
                                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                                        <div style={{ padding: '15px 0', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                            <button
                                                onClick={() => handlePdf(order, 'receipt')}
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid #10b981', fontSize: '0.8rem', fontWeight: 'bold' }}
                                            >
                                                <FileDown size={16} /> Receipt
                                            </button>
                                            <button
                                                onClick={() => handlePdf(order, 'challan')}
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid #f59e0b', fontSize: '0.8rem', fontWeight: 'bold' }}
                                            >
                                                <FileDown size={16} /> Challan
                                            </button>
                                            <button
                                                onClick={() => onDeleteOrder(order.orderId)}
                                                style={{ padding: '10px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none' }}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>

                                        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '10px', padding: '10px' }}>
                                            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ opacity: 0.4, textAlign: 'left' }}>
                                                        <th style={{ padding: '8px 0' }}>Item</th>
                                                        <th>Qty</th>
                                                        <th style={{ textAlign: 'right' }}>Rate</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {order.cart.map((item, idx) => (
                                                        <tr key={idx} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <td style={{ padding: '8px 0' }}>
                                                                {item.name} <span style={{ opacity: 0.4, fontSize: '0.7rem' }}>({item.color})</span>
                                                                {item.type === 'interest' && <span style={{ marginLeft: '6px', fontSize: '0.65rem', color: '#f472b6', background: 'rgba(244,114,182,0.1)', padding: '1px 5px', borderRadius: '4px' }}>Interest</span>}
                                                            </td>
                                                            <td>{item.qty}</td>
                                                            <td style={{ textAlign: 'right' }}>₹{item.rate}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
};

export default SalesHistoryPanel;
