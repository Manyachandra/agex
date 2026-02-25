import { useState, useEffect } from 'react'
import axios from 'axios'
import { Save, RefreshCw, AlertTriangle, Info, CheckCircle, XCircle, MessageSquare, Zap, ShieldOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

const PARAM_LABELS = {
  exchange_cycle_interval: 'Exchange Cycle Interval',
  task_cycle_interval: 'Task Cycle Interval',
  trade_fee: 'Trade Fee',
  bankruptcy_threshold: 'Bankruptcy Threshold',
  dominant_multiplier: 'Dominant Multiplier',
  dashboard_refresh_rate: 'Dashboard Refresh Rate',
}

const PARAM_UNITS = {
  exchange_cycle_interval: 'min',
  task_cycle_interval: 'min',
  trade_fee: '%',
  bankruptcy_threshold: '$',
  dominant_multiplier: 'x',
  dashboard_refresh_rate: 's',
}

const AGENT_COLORS = {
  ZEUS: '#f03358', RAVI: '#2563eb', NOVA: '#7c3aed',
  BRAHMA: '#f5a623', KIRA: '#00b87a',
}

function getColor(ticker) {
  return AGENT_COLORS[ticker] || `hsl(${[...ticker].reduce((h, c) => h + c.charCodeAt(0), 0) % 360}, 60%, 50%)`
}

function timeAgo(d) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const DEFAULTS = {
  exchange_cycle_interval: 10, task_cycle_interval: 15, trade_fee: 2,
  bankruptcy_threshold: 0.10, dominant_multiplier: 1.5,
  allow_agent_suggestions: true, dashboard_refresh_rate: 30,
}

export default function Settings() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [settings, setSettings] = useState(DEFAULTS)
  const [suggestions, setSuggestions] = useState([])
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/settings`).catch(() => ({ data: DEFAULTS })),
      axios.get(`${API}/api/settings/suggestions?status=pending`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/settings/suggestions?status=all`).catch(() => ({ data: [] })),
    ]).then(([s, p, h]) => {
      setSettings(s.data || DEFAULTS)
      setSuggestions((p.data || []).filter(x => x.status === 'pending'))
      setHistory((h.data || []).filter(x => x.status !== 'pending').slice(0, 10))
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const r = await axios.put(`${API}/api/settings`, settings)
      setSettings(r.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  const handleReset = () => setSettings(prev => ({ ...prev, ...DEFAULTS }))

  const handleApprove = async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: 'approve' }))
    try {
      await axios.put(`${API}/api/settings/suggestions/${id}/approve`)
      setSuggestions(prev => prev.filter(s => s.id !== id))
      const r = await axios.get(`${API}/api/settings`)
      setSettings(r.data || DEFAULTS)
    } catch {}
    setActionLoading(prev => ({ ...prev, [id]: null }))
  }

  const handleReject = async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: 'reject' }))
    try {
      await axios.put(`${API}/api/settings/suggestions/${id}/reject`)
      setSuggestions(prev => prev.filter(s => s.id !== id))
    } catch {}
    setActionLoading(prev => ({ ...prev, [id]: null }))
  }

  const toggleSuggestions = async () => {
    const val = !settings.allow_agent_suggestions
    setSettings(prev => ({ ...prev, allow_agent_suggestions: val }))
    try {
      await axios.put(`${API}/api/settings`, { allow_agent_suggestions: val })
    } catch {}
  }

  if (loading) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
        Loading settings...
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Exchange configuration, agent suggestions, and parameters</div>
      </div>

      {!isAdmin && (
        <div className="card" style={{ marginBottom: 20, background: '#fffbe6', border: '1px solid #ffe58f', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <ShieldOff size={16} color="#d48806" />
          <span style={{ fontSize: '0.78rem', color: '#7c6a0a' }}>
            You are viewing settings in read-only mode. Admin access is required to make changes.
          </span>
        </div>
      )}

      {/* PENDING SUGGESTIONS */}
      <div className="card" style={{ marginBottom: 20, border: suggestions.length > 0 ? '1px solid var(--gold)' : undefined }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="card-title">Pending Agent Suggestions</div>
            {suggestions.length > 0 && (
              <span className="badge badge-gold">{suggestions.length}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>
              Allow suggestions
            </span>
            <button onClick={toggleSuggestions} disabled={!isAdmin} style={{
              background: settings.allow_agent_suggestions ? 'var(--green)' : 'var(--border)',
              width: 44, height: 24, borderRadius: 12, border: 'none',
              cursor: 'pointer', position: 'relative', transition: 'background 0.2s'
            }}>
              <div style={{
                position: 'absolute', top: 3,
                left: settings.allow_agent_suggestions ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>
        </div>

        {suggestions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: '0.75rem' }}>
            <MessageSquare size={20} style={{ marginBottom: 6, opacity: 0.4 }} />
            <div>No pending suggestions. Agents submit proposals every 5 cycles.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {suggestions.map(s => (
            <div key={s.id} style={{
              background: 'var(--bg)', borderRadius: 10, padding: 14,
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: getColor(s.agent_ticker),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif", fontSize: '0.65rem',
                  fontWeight: 800, color: 'white', flexShrink: 0
                }}>
                  {s.agent_ticker?.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
                    ${s.agent_ticker}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text3)' }}>
                    {timeAgo(s.created_at)}
                  </div>
                </div>
                <span className="badge badge-gold" style={{ fontSize: '0.58rem' }}>
                  {PARAM_LABELS[s.parameter] || s.parameter}
                </span>
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px',
                fontSize: '0.75rem', fontFamily: "'Geist Mono', monospace"
              }}>
                <span style={{ color: 'var(--text3)' }}>
                  {s.current_value}{PARAM_UNITS[s.parameter] || ''}
                </span>
                <span style={{ color: 'var(--text3)' }}>→</span>
                <span style={{ fontWeight: 700, color: 'var(--green)' }}>
                  {s.proposed_value}{PARAM_UNITS[s.parameter] || ''}
                </span>
              </div>

              <div style={{
                fontSize: '0.72rem', color: 'var(--text2)',
                lineHeight: 1.6, marginBottom: 12, fontStyle: 'italic'
              }}>
                "{s.reasoning}"
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => handleApprove(s.id)}
                  disabled={!isAdmin || !!actionLoading[s.id]}
                  style={{
                    background: 'var(--green)', color: 'white',
                    fontSize: '0.68rem', padding: '6px 14px', gap: 5,
                    opacity: actionLoading[s.id] ? 0.5 : 1
                  }}
                >
                  <CheckCircle size={12} />
                  {actionLoading[s.id] === 'approve' ? 'Applying...' : 'Approve'}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => handleReject(s.id)}
                  disabled={!isAdmin || !!actionLoading[s.id]}
                  style={{
                    borderColor: 'var(--red)', color: 'var(--red)',
                    fontSize: '0.68rem', padding: '6px 14px', gap: 5,
                    opacity: actionLoading[s.id] ? 0.5 : 1
                  }}
                >
                  <XCircle size={12} />
                  {actionLoading[s.id] === 'reject' ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Exchange Engine */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Exchange Engine</div>
              <span className="badge badge-green">RUNNING</span>
            </div>
            {[
              { label: 'Exchange Cycle Interval', key: 'exchange_cycle_interval', unit: 'minutes', min: 1, max: 60 },
              { label: 'Task Cycle Interval', key: 'task_cycle_interval', unit: 'minutes', min: 1, max: 60 },
              { label: 'Dashboard Refresh Rate', key: 'dashboard_refresh_rate', unit: 'seconds', min: 10, max: 300 },
            ].map(s => (
              <div key={s.key} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{s.label}</label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>
                    {settings[s.key]} {s.unit}
                  </span>
                </div>
                <input type="range" min={s.min} max={s.max}
                  value={settings[s.key] || 0}
                  onChange={e => setSettings({ ...settings, [s.key]: parseInt(e.target.value) })}
                  disabled={!isAdmin}
                  style={{ width: '100%', accentColor: 'var(--green)' }}
                />
              </div>
            ))}
          </div>

          {/* Trading Rules */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Trading Rules</div>
            </div>
            {[
              { label: 'Trade Fee', key: 'trade_fee', unit: '%', min: 0, max: 10, step: 0.5 },
              { label: 'Bankruptcy Threshold', key: 'bankruptcy_threshold', unit: '$', min: 0.01, max: 1, step: 0.01 },
              { label: 'Dominant Price Multiplier', key: 'dominant_multiplier', unit: 'x avg', min: 1.1, max: 3, step: 0.1 },
            ].map(s => (
              <div key={s.key} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{s.label}</label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>
                    {settings[s.key]} {s.unit}
                  </span>
                </div>
                <input type="range" min={s.min} max={s.max} step={s.step || 1}
                  value={settings[s.key] || 0}
                  onChange={e => setSettings({ ...settings, [s.key]: parseFloat(e.target.value) })}
                  disabled={!isAdmin}
                  style={{ width: '100%', accentColor: 'var(--green)' }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Suggestion History */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Suggestion History</div>
              <Zap size={14} color="var(--text3)" />
            </div>
            {history.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text3)', fontSize: '0.72rem' }}>
                No resolved suggestions yet
              </div>
            )}
            {history.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0', borderBottom: '1px solid var(--border)'
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: getColor(s.agent_ticker),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.5rem', fontWeight: 800, color: 'white', flexShrink: 0,
                  fontFamily: "'Syne', sans-serif"
                }}>
                  {s.agent_ticker?.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600 }}>
                    {PARAM_LABELS[s.parameter] || s.parameter}: {s.current_value} → {s.proposed_value}
                  </div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text3)' }}>
                    ${s.agent_ticker} · {timeAgo(s.created_at)}
                  </div>
                </div>
                <span className={`badge ${s.status === 'approved' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.55rem' }}>
                  {s.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          {/* System Info */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">System Info</div>
              <Info size={14} color="var(--text3)" />
            </div>
            {[
              { label: 'Backend', value: 'Node.js + Express' },
              { label: 'Database', value: 'Supabase (PostgreSQL)' },
              { label: 'AI Engine', value: 'OpenAI GPT-4o' },
              { label: 'Frontend', value: 'React + Vite' },
              { label: 'Real-time', value: 'Socket.io' },
              { label: 'Exchange Status', value: '🟢 RUNNING' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < 5 ? '1px solid var(--border)' : 'none'
              }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{item.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)' }}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Danger Zone */}
          <div className="card" style={{ border: '1px solid var(--red-bg)', background: '#fff8f8' }}>
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--red)' }}>Danger Zone</div>
              <AlertTriangle size={14} color="var(--red)" />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: 12 }}>
              These actions cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.7rem' }}>
                Reset All Agents
              </button>
              <button className="btn btn-outline" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.7rem' }}>
                Clear Activity Log
              </button>
            </div>
          </div>
        </div>
      </div>

      {!!isAdmin && (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-outline" onClick={handleReset}>
            <RefreshCw size={14} style={{ marginRight: 6 }} />
            Reset Defaults
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={14} style={{ marginRight: 6 }} />
            {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  )
}
