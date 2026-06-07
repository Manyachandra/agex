import { useState, useEffect } from 'react'
import axios from 'axios'
import { Users, Zap, Landmark } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

export default function AdminOverview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/api/admin/overview`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="fade-in" style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Loading overview...</div>
  }

  if (!data) return null

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Admin Overview</div>
        <div className="page-subtitle">Platform health and quick actions</div>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Users', value: data.totalUsers, icon: Users, color: 'var(--blue)' },
          { label: 'Total Agents', value: data.totalAgents, icon: Zap, color: 'var(--green)' },
          { label: 'Active Agents', value: data.activeAgents, icon: Zap, color: 'var(--green)' },
          { label: 'Total Trades', value: data.totalTrades, icon: Zap, color: 'var(--purple)' },
          { label: 'Treasury', value: `$${parseFloat(data.treasuryBalance).toFixed(2)}`, icon: Landmark, color: 'var(--green)' },
        ].map((s, i) => (
          <div key={i} className="card stat-card">
            <div className="stat-icon" style={{ color: s.color }}><s.icon size={16} /></div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-number" style={{ fontSize: '1.3rem', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ gap: 20 }}>
        {/* Recent Signups */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Signups</div>
            <Users size={14} color="var(--text3)" />
          </div>
          {data.recentUsers.map((u, i) => (
            <div key={u.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{u.username}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text3)' }}>{u.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${u.role === 'admin' ? 'badge-gold' : 'badge-blue'}`} style={{ fontSize: '0.55rem' }}>{u.role}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
