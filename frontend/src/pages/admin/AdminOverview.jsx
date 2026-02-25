import { useState, useEffect } from 'react'
import axios from 'axios'
import { Users, Zap, Clock, Landmark, CheckCircle, XCircle, Loader } from 'lucide-react'
import AgentAvatar from '../../components/AgentAvatar'

const API = import.meta.env.VITE_API_URL

export default function AdminOverview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => {
    axios.get(`${API}/api/admin/overview`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const updateStatus = async (ticker, status) => {
    setActionLoading(p => ({ ...p, [ticker]: status }))
    try {
      await axios.put(`${API}/api/admin/agents/${ticker}/status`, { status })
      setData(prev => ({
        ...prev,
        pendingAgents: prev.pendingAgents.filter(a => a.ticker !== ticker),
        pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
        activeAgents: status === 'active' ? prev.activeAgents + 1 : prev.activeAgents,
      }))
    } catch {}
    setActionLoading(p => ({ ...p, [ticker]: null }))
  }

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
          { label: 'Pending Approvals', value: data.pendingApprovals, icon: Clock, color: data.pendingApprovals > 0 ? 'var(--gold)' : 'var(--text3)' },
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
        {/* Pending Agents */}
        <div className="card" style={{ border: data.pendingAgents.length > 0 ? '1px solid var(--gold)' : undefined }}>
          <div className="card-header">
            <div className="card-title">Pending Agents</div>
            {data.pendingAgents.length > 0 && <span className="badge badge-gold">{data.pendingAgents.length}</span>}
          </div>
          {data.pendingAgents.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: '0.72rem' }}>No pending agents</div>
          )}
          {data.pendingAgents.map(a => (
            <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="sm" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>${a.ticker} — {a.full_name}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text3)' }}>{a.style} · {a.creator_name || 'Unknown'}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn" onClick={() => updateStatus(a.ticker, 'active')} disabled={!!actionLoading[a.ticker]}
                  style={{ background: 'var(--green)', color: 'white', padding: '4px 10px', fontSize: '0.62rem', gap: 4 }}>
                  {actionLoading[a.ticker] === 'active' ? <Loader size={10} className="auth-spinner" /> : <CheckCircle size={10} />} Approve
                </button>
                <button className="btn" onClick={() => updateStatus(a.ticker, 'rejected')} disabled={!!actionLoading[a.ticker]}
                  style={{ background: 'var(--red)', color: 'white', padding: '4px 10px', fontSize: '0.62rem', gap: 4 }}>
                  {actionLoading[a.ticker] === 'rejected' ? <Loader size={10} className="auth-spinner" /> : <XCircle size={10} />} Reject
                </button>
              </div>
            </div>
          ))}
        </div>

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
