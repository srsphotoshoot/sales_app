import React, { useState } from 'react';
import { Plus, Trash2, Shield, ShieldOff, Users } from 'lucide-react';

const StaffManagement = ({
    staff,
    onAddStaff,
    onToggleStaff,
    onDeleteStaff,
    loading
}) => {
    const [newName, setNewName] = useState('');
    const [newCode, setNewCode] = useState('');

    const handleAdd = () => {
        if (!newName.trim() || !newCode.trim()) return;
        onAddStaff(newName.trim(), newCode.trim().toUpperCase());
        setNewName('');
        setNewCode('');
    };

    return (
        <div className="animate-fade-in">
            <div style={{ background: 'rgba(56, 189, 248, 0.05)', borderRadius: '15px', padding: '20px', border: '1px dashed rgba(56, 189, 248, 0.3)', marginBottom: '24px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={18}/> Add New Salesperson</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full Name" style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    <input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="Permanent Code (e.g. RAJESH121)" style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    <button
                        disabled={loading || !newName.trim() || !newCode.trim()}
                        onClick={handleAdd}
                        className="action-btn" style={{ background: 'var(--accent-new)', color: 'white', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 'bold' }}>
                        Register Staff
                    </button>
                </div>
            </div>

            <h5 style={{ marginBottom: '12px', opacity: 0.6 }}>Registered Staff ({staff.length})</h5>
            {staff.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '15px', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                    <Users size={32} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                    No staff members registered.
                </div>
            ) : staff.map(s => (
                <div key={s.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div>
                        <div style={{ fontWeight: 'bold', color: s.isActive ? 'white' : 'rgba(255,255,255,0.3)' }}>{s.name}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.4 }}>Code: {s.code}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <button onClick={() => { if (window.confirm(`${s.isActive ? 'Deactivate' : 'Activate'} "${s.name}"?`)) onToggleStaff(s.id); }} style={{ background: 'none', border: 'none', color: s.isActive ? '#10b981' : '#ef4444' }}>
                            {s.isActive ? <Shield size={20} /> : <ShieldOff size={20} />}
                        </button>
                        <button onClick={() => onDeleteStaff(s.id)} style={{ background: 'none', border: 'none', color: '#ef4444', opacity: 0.6 }}>
                            <Trash2 size={20} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StaffManagement;
