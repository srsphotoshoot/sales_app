import React from 'react';
import { Search, Edit2, Package, Plus, X } from 'lucide-react';
import { getAbsoluteImageUrl } from '../../services/api';
import { saveVariants, deleteProduct } from '../../services/api';
import AuthImage from '../AuthImage.jsx';

const InventorySubPanel = ({
    products,
    searchTerm,
    setSearchTerm,
    onEditProduct,
    onRefresh,
    activeApiUrl,
    loading
}) => {
    const [displayLimit, setDisplayLimit] = React.useState(50);
    const [addingColorForId, setAddingColorForId] = React.useState(null);
    const [newColorInput, setNewColorInput] = React.useState('');
    const [busyUids, setBusyUids] = React.useState(new Set());

    React.useEffect(() => {
        setDisplayLimit(50);
    }, [searchTerm]);

    // Group by base id
    const groupedProducts = React.useMemo(() => {
        const groups = {};
        products.forEach(p => {
            const key = (p.id !== undefined && p.id !== null && p.id !== '') ? String(p.id) : String(p.uid);
            if (!groups[key]) {
                groups[key] = { ...p, variants: [] };
            }
            groups[key].variants.push(p);
        });
        return Object.values(groups);
    }, [products]);

    const filteredGroups = React.useMemo(() => {
        if (!searchTerm) return groupedProducts;
        const lower = searchTerm.toLowerCase();
        return groupedProducts.filter(g =>
            g.name?.toLowerCase().includes(lower) ||
            String(g.id || '').toLowerCase().includes(lower) ||
            g.variants.some(v => v.color?.toLowerCase().includes(lower))
        );
    }, [groupedProducts, searchTerm]);

    const visibleGroups = filteredGroups.slice(0, displayLimit);
    const hasMore = filteredGroups.length > displayLimit;

    const handleRemoveColor = async (group, variant) => {
        const isLast = group.variants.length === 1;
        const msg = isLast
            ? `Removing "${variant.color}" will delete this product entirely. Continue?`
            : `Remove color "${variant.color}"?`;
        if (!window.confirm(msg)) return;
        setBusyUids(prev => new Set([...prev, variant.uid]));
        try {
            if (isLast) {
                await deleteProduct(variant.uid);
            } else {
                await saveVariants(String(group.id || group.uid), [{ uid: variant.uid, isDeleted: true }]);
            }
            onRefresh && onRefresh();
        } catch (e) {
            alert('Color remove failed: ' + e.message);
        } finally {
            setBusyUids(prev => { const s = new Set(prev); s.delete(variant.uid); return s; });
        }
    };

    const handleAddColor = async (group) => {
        const color = newColorInput.trim().toUpperCase();
        if (!color) return;
        const tempKey = `add-${group.id || group.uid}`;
        setBusyUids(prev => new Set([...prev, tempKey]));
        try {
            await saveVariants(String(group.id || group.uid), [{
                color,
                isNew: true,
                rate: group.rate || 0,
            }]);
            setAddingColorForId(null);
            setNewColorInput('');
            onRefresh && onRefresh();
        } catch (e) {
            alert('Color add failed: ' + e.message);
        } finally {
            setBusyUids(prev => { const s = new Set(prev); s.delete(tempKey); return s; });
        }
    };

    return (
        <div className="animate-fade-in">
            <div style={{ position: 'relative', marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: '100%', padding: '12px 12px 12px 40px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white', fontSize: '0.9rem'
                    }}
                />
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '13px', opacity: 0.4 }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {visibleGroups.length === 0 ? (
                    groupedProducts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '50px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <Package size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.2 }} />
                            <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>No products yet</p>
                            <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '16px' }}>Import via Bulk Upload tab or add products one by one.</p>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px', opacity: 0.3 }}>
                            <Package size={40} style={{ margin: '0 auto 10px', display: 'block' }} />
                            No products match your search.
                        </div>
                    )
                ) : visibleGroups.map(group => (
                    <div key={group.id || group.uid} style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {/* Product info row */}
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '12px' }}>
                            <div style={{
                                width: '60px', height: '60px', borderRadius: '8px',
                                background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <AuthImage
                                    src={group.imageUrl ? getAbsoluteImageUrl(group.imageUrl, activeApiUrl) : null}
                                    alt={group.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    fallback={<Package size={24} style={{ opacity: 0.1 }} />}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>{group.name}</div>
                                        <div style={{ fontSize: '0.7rem', opacity: 0.4 }}>ID: {group.id} &nbsp;|&nbsp; ₹{group.rate}</div>
                                    </div>
                                    <button
                                        onClick={() => onEditProduct(group)}
                                        style={{ padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white' }}
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Color chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            {group.variants.map(variant => (
                                <div key={variant.uid} style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '4px 10px', borderRadius: '20px',
                                    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                                    fontSize: '0.78rem', fontWeight: '600', color: 'var(--accent-new)'
                                }}>
                                    {variant.color || 'General'}
                                    <button
                                        onClick={() => !busyUids.has(variant.uid) && handleRemoveColor(group, variant)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', padding: '0 0 0 2px', lineHeight: 1, cursor: 'pointer' }}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}

                            {/* Add color */}
                            {addingColorForId === (group.id || group.uid) ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <input
                                        autoFocus
                                        value={newColorInput}
                                        onChange={e => setNewColorInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleAddColor(group);
                                            if (e.key === 'Escape') { setAddingColorForId(null); setNewColorInput(''); }
                                        }}
                                        placeholder="e.g. PINK"
                                        style={{
                                            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '8px', color: 'white', padding: '4px 8px', fontSize: '0.78rem',
                                            width: '90px', outline: 'none'
                                        }}
                                    />
                                    <button
                                        onClick={() => handleAddColor(group)}
                                        disabled={busyUids.has(`add-${group.id || group.uid}`)}
                                        style={{ padding: '4px 10px', borderRadius: '8px', background: 'var(--accent-new)', border: 'none', color: 'white', fontSize: '0.75rem', fontWeight: '700' }}
                                    >
                                        Add
                                    </button>
                                    <button
                                        onClick={() => { setAddingColorForId(null); setNewColorInput(''); }}
                                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setAddingColorForId(group.id || group.uid); setNewColorInput(''); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        padding: '4px 10px', borderRadius: '20px',
                                        background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)',
                                        color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', cursor: 'pointer'
                                    }}
                                >
                                    <Plus size={12} /> Add Color
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '30px', paddingBottom: '20px' }}>
                    <button
                        onClick={() => setDisplayLimit(prev => prev + 50)}
                        style={{
                            padding: '12px 24px', borderRadius: '12px', background: 'var(--accent-new)',
                            color: 'white', border: 'none', fontWeight: '600', cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
                        }}
                    >
                        Load More ({filteredGroups.length - displayLimit} Remaining)
                    </button>
                </div>
            )}
        </div>
    );
};

export default InventorySubPanel;
