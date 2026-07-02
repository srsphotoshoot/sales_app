import React, { useState } from 'react';
import { Award, TrendingUp, Users, Calendar } from 'lucide-react';

const PerformancePanel = ({ performanceData, perfTimeframe, setPerfTimeframe, popularItems }) => {
    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
                {['today', 'week', 'month', 'all'].map(tf => (
                    <button 
                        key={tf}
                        onClick={() => setPerfTimeframe(tf)}
                        style={{
                            padding: '8px 16px', borderRadius: '10px', border: 'none',
                            background: perfTimeframe === tf ? 'var(--accent-new)' : 'rgba(255,255,255,0.05)',
                            color: 'white', fontSize: '0.8rem', fontWeight: 'bold'
                        }}
                    >
                        {tf.toUpperCase()}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '15px', borderRadius: '15px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                    <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Total Value</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>₹{performanceData.reduce((sum, u) => sum + u.salesValue, 0)}</div>
                </div>
                <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: '15px', borderRadius: '15px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                    <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Total Items</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#38bdf8' }}>{performanceData.reduce((sum, u) => sum + u.salesCount, 0)}</div>
                </div>
            </div>

            <h5 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={16}/> Staff Leaderboard</h5>
            {performanceData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', opacity: 0.2 }}>No performance data for this period.</div>
            ) : performanceData.map((user, idx) => (
                <div key={user.name} style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: idx === 0 ? '#f59e0b' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>{idx + 1}</div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{user.name}</div>
                            <div style={{ fontSize: '0.7rem', opacity: 0.4 }}>{user.orderCount} Orders</div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--accent-new)', fontWeight: 'bold' }}>₹{user.salesValue}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{user.salesCount} sold</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default PerformancePanel;
