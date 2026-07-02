import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronDown, ChevronUp, FileDown, CheckCircle, Clock, Loader2, ShoppingCart, Heart } from 'lucide-react';
import { getBaseUrl, getAuthHeaders } from '../services/api';
import { generateOrderPdf } from '../utils/pdfGenerator';

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

const UserOrderHistory = ({ staffName, onClose }) => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('sale');
    const [expandedOrder, setExpandedOrder] = useState(null);
    const [downloaded, setDownloaded] = useState(getDownloaded);
    const [bulkProgress, setBulkProgress] = useState(null);

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            try {
                const baseUrl = await getBaseUrl();
                const headers = await getAuthHeaders();
                const res = await fetch(`${baseUrl}/api/sales/history`, { headers });
                if (!res.ok) throw new Error(`Server error (${res.status})`);
                const data = await res.json();
                if (Array.isArray(data)) {
                    const mine = staffName
                        ? data.filter(o => o.createdBy === staffName)
                        : data;
                    setOrders(mine.reverse());
                }
            } catch (e) {
                console.error('Failed to fetch orders', e);
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, [staffName]);

    const filteredOrders = orders.filter(order => {
        if (tab === 'interest') return order.cart && order.cart.some(item => item.type === 'interest');
        return order.cart && order.cart.some(item => !item.type || item.type === 'sale');
    });

    const handlePdf = useCallback(async (order, pdfType) => {
        try {
            await generateOrderPdf(order, pdfType);
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
    }, []);

    const handleDownloadAll = useCallback(async () => {
        if (bulkProgress) return;
        const pending = filteredOrders.filter(o => !downloaded.has(o.orderId));
        if (pending.length === 0) { alert('All order PDFs have already been downloaded.'); return; }
        setBulkProgress({ done: 0, total: pending.length });
        for (let i = 0; i < pending.length; i++) {
            await handlePdf(pending[i], 'receipt');
            setBulkProgress({ done: i + 1, total: pending.length });
            await new Promise(r => setTimeout(r, 800));
        }
        setBulkProgress(null);
    }, [filteredOrders, downloaded, bulkProgress, handlePdf]);

    const pendingCount = filteredOrders.filter(o => !downloaded.has(o.orderId)).length;
    const doneCount = filteredOrders.length - pendingCount;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(10,15,30,0.98)', zIndex: 1000,
            display: 'flex', flexDirection: 'column', color: 'white'
        }}>
            {/* Header */}
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>My Orders</h2>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', padding: '4px' }}>
                    <X size={26} />
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '12px 20px', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                    { id: 'sale', label: 'Sales', icon: ShoppingCart },
                    { id: 'interest', label: 'Interests', icon: Heart }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => { setTab(t.id); setExpandedOrder(null); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '10px', border: 'none',
                            background: tab === t.id ? 'var(--accent-new)' : 'rgba(255,255,255,0.05)',
                            color: tab === t.id ? 'white' : 'rgba(255,255,255,0.5)',
                            fontWeight: '600', fontSize: '0.85rem'
                        }}
                    >
                        <t.icon size={15} /> {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', paddingTop: '60px', opacity: 0.4 }}>
                        <Loader2 size={32} className="spinner" style={{ margin: '0 auto 12px', display: 'block' }} />
                        <p>Loading...</p>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div style={{ textAlign: 'center', paddingTop: '60px', opacity: 0.2 }}>
                        {tab === 'interest' ? <Heart size={48} style={{ margin: '0 auto 15px', display: 'block' }} /> : <ShoppingCart size={48} style={{ margin: '0 auto 15px', display: 'block' }} />}
                        <p>No {tab === 'interest' ? 'interests' : 'sales'} recorded yet.</p>
                    </div>
                ) : (
                    <>
                        {/* Stats + Download All */}
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
                                    fontWeight: '700', fontSize: '0.8rem'
                                }}
                            >
                                {bulkProgress
                                    ? <><Loader2 size={14} className="spinner" /> {bulkProgress.done}/{bulkProgress.total}</>
                                    : <><FileDown size={14} /> Download All</>}
                            </button>
                        </div>

                        {filteredOrders.map(order => {
                            const isDownloaded = downloaded.has(order.orderId);
                            return (
                                <div
                                    key={order.orderId}
                                    style={{
                                        borderRadius: '14px',
                                        border: isDownloaded ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(245,158,11,0.3)',
                                        background: isDownloaded ? 'rgba(16,185,129,0.04)' : 'rgba(245,158,11,0.04)',
                                        marginBottom: '12px', overflow: 'hidden'
                                    }}
                                >
                                    <div
                                        onClick={() => setExpandedOrder(expandedOrder === order.orderId ? null : order.orderId)}
                                        style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{order.customer.name}</div>
                                            <div style={{ fontSize: '0.72rem', opacity: 0.45 }}>{new Date(order.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ color: 'var(--accent-new)', fontWeight: 'bold' }}>₹{order.totalValue}</div>
                                                <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{order.totalItems} Items</div>
                                            </div>
                                            {isDownloaded ? <CheckCircle size={17} color="#10b981" /> : <Clock size={17} color="#f59e0b" />}
                                            {expandedOrder === order.orderId ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                                        </div>
                                    </div>

                                    {expandedOrder === order.orderId && (
                                        <div style={{ padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', paddingBottom: '10px' }}>
                                                <button
                                                    onClick={() => handlePdf(order, 'receipt')}
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid #10b981', fontSize: '0.8rem', fontWeight: 'bold' }}
                                                >
                                                    <FileDown size={15} /> Receipt
                                                </button>
                                                <button
                                                    onClick={() => handlePdf(order, 'challan')}
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid #f59e0b', fontSize: '0.8rem', fontWeight: 'bold' }}
                                                >
                                                    <FileDown size={15} /> Challan
                                                </button>
                                            </div>
                                            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '8px' }}>
                                                {order.cart.map((item, idx) => (
                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: idx ? '1px solid rgba(255,255,255,0.04)' : 'none', fontSize: '0.8rem' }}>
                                                        <span>
                                                            {item.name} <span style={{ opacity: 0.4 }}>({item.color})</span>
                                                            {item.type === 'interest' && <span style={{ marginLeft: '5px', fontSize: '0.65rem', color: '#f472b6' }}>Interest</span>}
                                                        </span>
                                                        <span>{item.qty} × ₹{item.rate}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
};

export default UserOrderHistory;
