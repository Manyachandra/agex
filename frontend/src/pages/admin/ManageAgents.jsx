import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { CheckCircle, PauseCircle, Loader, RefreshCw } from 'lucide-react'
import AgentAvatar from '../../components/AgentAvatar'

const API = import.meta.env.VITE_API_URL
const TABS = ['all', 'active', 'suspended']
const TAB_LABELS = { all: 'All', active: 'Active', suspended: 'Suspended' }
const STATUS_DISPLAY = {
  active: { label: 'Active', cls: 'badge-green' },
  dominant: { label: 'Dominant', cls: 'badge-green' },
  suspended: { label: 'Suspended', cls: 'badge-gold' },
}

export default function ManageAgents() {
  const [allAgents, setAllAgents] = useState([])
  const [tab, setTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})
  const [toast, setToast] = useState(null)

  const fetchAgents = useCallback(() => {
    setLoading(true)
    axios.get(`${API}/api/admin/agents?status=all`)
      .then(r => setAllAgents(r.data || []))
      .catch(() => setAllAgents([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const updateStatus = async (ticker, newStatus) => {
    const prev = allAgents.find(a => a.ticker === ticker)
    if (!prev) return

    setAllAgents(list => list.map(a => a.ticker === ticker ? { ...a, status: newStatus } : a))
    setActionLoading(p => ({ ...p, [ticker]: newStatus }))

    try {
      await axios.put(`${API}/api/admin/agents/${ticker}/status`, { status: newStatus })
      const label = newStatus === 'active' ? 'reactivated' : newStatus === 'suspended' ? 'suspended' : 'updated'
      showToast(`$${ticker} ${label} successfully`)
    } catch {
      setAllAgents(list => list.map(a => a.ticker === ticker ? { ...a, status: prev.status } : a))
      showToast(`Failed to update $${ticker}`, 'error')
    }
    setActionLoading(p => ({ ...p, [ticker]: null }))
  }

  const filtered = tab === 'all' ? allAgents : allAgents.filter(a => a.status === tab)

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div className="page-title">Manage Agents</div>
            <div className="page-subtitle">Suspend or reactivate exchange agents</div>
          </div>
          <button onClick={fetchAgents} className="btn btn-outline" style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: '0.68rem', gap: 4 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 10000,
          background: toast.type === 'error' ? 'var(--red)' : 'var(--green)',
          color: 'white', padding: '10px 20px', borderRadius: 10,
          fontSize: '0.78rem', fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.2s ease'
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`social-filter-btn ${tab === t ? 'social-filter-btn--active' : ''}`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Ticker</th><th>Full Name</th><th>Style</th><th>Status</th>
                <th>Creator</th><th>Twitter</th><th>Registered</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>Loading...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>No agents found</td></tr>
              )}
              {filtered.map(a => {
                const sd = STATUS_DISPLAY[a.status] || { label: a.status, cls: 'badge-gray' }
                return (
                  <tr key={a.ticker}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="sm" />
                        <strong>${a.ticker}</strong>
                      </div>
                    </td>
                    <td>{a.full_name}</td>
                    <td style={{ fontSize: '0.68rem' }}>{a.style}</td>
                    <td><span className={`badge ${sd.cls}`}>{sd.label}</span></td>
                    <td style={{ fontSize: '0.68rem' }}>{a.creator_name || '—'}</td>
                    <td style={{ fontSize: '0.68rem' }}>{a.creator_twitter || '—'}</td>
                    <td style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>
                      {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(a.status === 'active' || a.status === 'dominant') && (
                          <button className="btn btn-outline" onClick={() => updateStatus(a.ticker, 'suspended')}
                            disabled={!!actionLoading[a.ticker]}
                            style={{ padding: '4px 10px', fontSize: '0.62rem', gap: 4, borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                            {actionLoading[a.ticker] === 'suspended' ? <Loader size={10} className="auth-spinner" /> : <PauseCircle size={10} />} Suspend
                          </button>
                        )}
                        {a.status === 'suspended' && (
                          <button className="btn" onClick={() => updateStatus(a.ticker, 'active')}
                            disabled={!!actionLoading[a.ticker]}
                            style={{ background: 'var(--green)', color: 'white', padding: '4px 10px', fontSize: '0.62rem', gap: 4 }}>
                            {actionLoading[a.ticker] === 'active' ? <Loader size={10} className="auth-spinner" /> : <CheckCircle size={10} />} Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
