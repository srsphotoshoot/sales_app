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
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('Staff');

    const handleAdd = () => {
        if (!newName.trim() || !newEmail.trim()) return;
        onAddStaff(newName.trim(), newEmail.trim().toLowerCase(), newRole);
        setNewName('');
        setNewEmail('');
        setNewRole('Staff');
    };

    return (
        <div className="animate-fade-in">
            <div style={{ background: 'rgba(56, 189, 248, 0.05)', borderRadius: '15px', padding: '20px', border: '1px dashed rgba(56, 189, 248, 0.3)', marginBottom: '24px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={18}/> Add New User</h4>
                <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '6px' }}>They'll sign in with this Google account, and it'll automatically get access to the product photos Drive folder.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full Name" style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" placeholder="Google account email" style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                        <option value="Staff">Staff</option>
                        <option value="Admin">Admin</option>
                    </select>
                    <button
                        disabled={loading || !newName.trim() || !newEmail.trim()}
                        onClick={handleAdd}
                        className="action-btn" style={{ background: 'var(--accent-new)', color: 'white', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 'bold' }}>
                        Register User
                    </button>
                </div>
            </div>

            <h5 style={{ marginBottom: '12px', opacity: 0.6 }}>Registered Users ({staff.length})</h5>
            {staff.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '15px', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                    <Users size={32} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                    No users registered.
                </div>
            ) : staff.map(s => (
                <div key={s.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div>
                        <div style={{ fontWeight: 'bold', color: s.isActive ? 'white' : 'rgba(255,255,255,0.3)' }}>{s.name} <span style={{ fontSize: '0.65rem', opacity: 0.5, fontWeight: 'normal' }}>({s.role})</span></div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.4 }}>{s.email || 'no email set — cannot log in yet'}</div>
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
