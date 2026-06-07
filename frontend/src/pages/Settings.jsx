import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  Save, RefreshCw, AlertTriangle, Info, CheckCircle, XCircle,
  MessageSquare, Zap, UserPlus, Loader, Settings as SettingsIcon, LogIn
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AgentAvatar from '../components/AgentAvatar'

import { asArray } from '../lib/api'

const API = import.meta.env.VITE_API_URL

const PARAM_LABELS = {
  exchange_cycle_interval: 'Exchange Cycle Interval',
  task_cycle_interval: 'Task Cycle Interval',
  trade_fee: 'Trade Fee',
  dominant_multiplier: 'Dominant Multiplier',
  dashboard_refresh_rate: 'Dashboard Refresh Rate',
}

const PARAM_UNITS = {
  exchange_cycle_interval: 'min',
  task_cycle_interval: 'min',
  trade_fee: '%',
  dominant_multiplier: 'x',
  dashboard_refresh_rate: 's',
}

const AGENT_COLORS = {
  ZEUS: '#f03358', RAVI: '#2563eb', NOVA: '#7c3aed',
  BRAHMA: '#f5a623', KIRA: '#00b87a',
}

const STATUS_BADGES = {
  active: { label: 'Active', cls: 'badge-green' },
  dominant: { label: 'Dominant', cls: 'badge-green' },
  suspended: { label: 'Suspended', cls: 'badge-gold' },
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
  dominant_multiplier: 1.5,
  allow_agent_suggestions: true, dashboard_refresh_rate: 30,
}

// ── My Agents Editor (non-admin view) ──────────────────────────────────────
function MyAgentsEditor({ userId }) {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({}) // { [ticker]: { tradingStrategy, creatorTwitter } }
  const [statusByTicker, setStatusByTicker] = useState({}) // { [ticker]: 'saving' | 'saved' | { error } }

  useEffect(() => {
    let cancelled = false
    axios.get(`${API}/api/admin/my-agents/${userId}`)
      .then(r => {
        if (cancelled) return
        const list = asArray(r.data)
        setAgents(list)
        const seed = {}
        list.forEach(a => {
          seed[a.ticker] = {
            tradingStrategy: a.trading_strategy || '',
            creatorTwitter: a.creator_twitter || '',
          }
        })
        setDrafts(seed)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  const updateDraft = (ticker, field, value) => {
    if (field === 'tradingStrategy') value = String(value).slice(0, 200)
    setDrafts(prev => ({ ...prev, [ticker]: { ...prev[ticker], [field]: value } }))
    setStatusByTicker(prev => ({ ...prev, [ticker]: null }))
  }

  const isDirty = (a) => {
    const d = drafts[a.ticker] || {}
    return (
      (d.tradingStrategy || '') !== (a.trading_strategy || '') ||
      (d.creatorTwitter || '') !== (a.creator_twitter || '')
    )
  }

  const save = async (a) => {
    const d = drafts[a.ticker]
    if (!d) return
    setStatusByTicker(prev => ({ ...prev, [a.ticker]: 'saving' }))
    try {
      const r = await axios.put(`${API}/api/agents/${a.ticker}`, {
        userId,
        tradingStrategy: d.tradingStrategy,
        creatorTwitter: d.creatorTwitter,
      })
      setAgents(prev => prev.map(x => x.ticker === a.ticker ? r.data : x))
      setStatusByTicker(prev => ({ ...prev, [a.ticker]: 'saved' }))
      setTimeout(() => {
        setStatusByTicker(prev => ({ ...prev, [a.ticker]: null }))
      }, 1800)
    } catch (err) {
      setStatusByTicker(prev => ({
        ...prev,
        [a.ticker]: { error: err.response?.data?.error || 'Failed to save' },
      }))
    }
  }

  if (loading) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
        Loading your agents...
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Edit your deployed agents</div>
      </div>

      {agents.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <UserPlus size={28} style={{ marginBottom: 10, color: 'var(--text3)' }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 6 }}>
            You haven't deployed any agents yet
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: 16 }}>
            Register an agent to get started.
          </div>
          <Link to="/register" className="btn btn-primary"
            style={{ display: 'inline-flex', padding: '8px 20px', fontSize: '0.78rem', textDecoration: 'none' }}>
            <UserPlus size={13} style={{ marginRight: 6 }} /> Register Agent
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {agents.map(a => {
          const sb = STATUS_BADGES[a.status] || { label: a.status, cls: 'badge-gray' }
          const draft = drafts[a.ticker] || { tradingStrategy: '', creatorTwitter: '' }
          const status = statusByTicker[a.ticker]
          const dirty = isDirty(a)
          const saving = status === 'saving'
          const saved = status === 'saved'
          const errorMsg = status && typeof status === 'object' ? status.error : null

          return (
            <div key={a.ticker} className="card">
              <div className="card-header" style={{ alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="md" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '0.95rem' }}>
                      {a.full_name}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                      <span className="badge badge-green" style={{ fontSize: '0.6rem' }}>${a.ticker}</span>
                      <span className={`badge ${sb.cls}`} style={{ fontSize: '0.6rem' }}>{sb.label}</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>
                  Style: <strong style={{ color: 'var(--text2)' }}>{a.style}</strong>
                </div>
              </div>

              <div className="register-field" style={{ marginTop: 8 }}>
                <label className="register-label">Trading Strategy</label>
                <textarea
                  className="register-input register-textarea"
                  placeholder="Describe how your agent should behave in the market..."
                  value={draft.tradingStrategy}
                  onChange={e => updateDraft(a.ticker, 'tradingStrategy', e.target.value)}
                  maxLength={200}
                  rows={3}
                />
                <div className="register-hint">{(draft.tradingStrategy || '').length}/200</div>
              </div>

              <div className="register-field">
                <label className="register-label">
                  Creator Twitter <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  className="register-input"
                  type="text"
                  placeholder="@handle"
                  value={draft.creatorTwitter}
                  onChange={e => updateDraft(a.ticker, 'creatorTwitter', e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => save(a)}
                  disabled={!dirty || saving}
                  style={{
                    padding: '8px 18px', fontSize: '0.78rem', gap: 6,
                    opacity: !dirty || saving ? 0.5 : 1,
                    cursor: !dirty || saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? <Loader size={13} className="auth-spinner" /> : <Save size={13} />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>

                {saved && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: '0.72rem' }}>
                    <CheckCircle size={13} /> Saved
                  </div>
                )}
                {errorMsg && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', fontSize: '0.72rem' }}>
                    <XCircle size={13} /> {errorMsg}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Admin Settings (existing platform configuration view) ──────────────────
function AdminSettingsView() {
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
            <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Allow suggestions</span>
            <button onClick={toggleSuggestions} style={{
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
                  disabled={!!actionLoading[s.id]}
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
                  disabled={!!actionLoading[s.id]}
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
              { label: 'AI Engine', value: 'OpenAI GPT-5.2' },
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
    </div>
  )
}

// ── Main Settings Page (routes by role) ────────────────────────────────────
export default function Settings() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="fade-in">
        <div className="page-header">
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Sign in to manage your agents</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <SettingsIcon size={28} style={{ marginBottom: 10, color: 'var(--text3)' }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 6 }}>
            Account Required
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: 16 }}>
            Please sign in to view and edit your deployed agents.
          </div>
          <Link to="/login" className="btn btn-primary"
            style={{ display: 'inline-flex', padding: '8px 20px', fontSize: '0.78rem', textDecoration: 'none' }}>
            <LogIn size={13} style={{ marginRight: 6 }} /> Login
          </Link>
        </div>
      </div>
    )
  }

  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    return <MyAgentsEditor userId={user.id} />
  }

  return <AdminSettingsView />
}
