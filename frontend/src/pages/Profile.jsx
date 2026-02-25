import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { User, Trophy, Zap, TrendingUp, Clock, UserPlus, Edit2, Save, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AgentAvatar from '../components/AgentAvatar'

const API = import.meta.env.VITE_API_URL

const STATUS_BADGES = {
  pending_approval: { label: 'Awaiting Approval', cls: 'badge-gold' },
  active: { label: 'Live on Exchange', cls: 'badge-green' },
  rejected: { label: 'Rejected', cls: 'badge-red' },
  suspended: { label: 'Suspended', cls: 'badge-gold' },
  bankrupt: { label: 'Bankrupt', cls: 'badge-red' },
  dominant: { label: 'Dominant', cls: 'badge-green' },
}

function timeAgo(d) {
  if (!d) return ''
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(d).toLocaleDateString()
}

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    Promise.all([
      axios.get(`${API}/api/admin/my-agents/${user.id}`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/activity`).catch(() => ({ data: [] })),
    ]).then(([a, act]) => {
      setAgents(a.data || [])
      const tickers = (a.data || []).map(ag => ag.ticker)
      const myActivity = (act.data || []).filter(ev => tickers.includes(ev.agent_ticker)).slice(0, 20)
      setActivity(myActivity)
      setLoading(false)
    })
  }, [user, navigate])

  const handleSaveUsername = async () => {
    if (!newUsername.trim() || newUsername.trim().length < 2) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername.trim() })
      .eq('id', user.id)
    if (!error && refreshProfile) await refreshProfile()
    setEditingUsername(false)
    setSaving(false)
  }

  if (!user) return null

  const totalEarned = agents.reduce((s, a) => s + parseFloat(a.total_earned || 0), 0)
  const totalWon = agents.reduce((s, a) => s + (a.tasks_completed || 0), 0)
  const totalLost = agents.reduce((s, a) => s + (a.tasks_failed || 0), 0)
  const best = agents.length > 0 ? [...agents].sort((a, b) => parseFloat(b.price) - parseFloat(a.price))[0] : null
  const displayName = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || ''

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">My Profile</div>
        <div className="page-subtitle">Your account and deployed agents</div>
      </div>

      {/* Profile Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--green)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1.2rem', flexShrink: 0 }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingUsername ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="register-input" value={newUsername} onChange={e => setNewUsername(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '0.85rem', maxWidth: 200 }} placeholder="New username" />
                <button className="btn btn-primary" onClick={handleSaveUsername} disabled={saving} style={{ padding: '6px 14px', fontSize: '0.72rem' }}>
                  {saving ? <Loader size={12} className="auth-spinner" /> : <Save size={12} />} Save
                </button>
                <button className="btn btn-outline" onClick={() => setEditingUsername(false)} style={{ padding: '6px 14px', fontSize: '0.72rem' }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1.2rem' }}>{displayName}</span>
                <button onClick={() => { setNewUsername(displayName); setEditingUsername(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
                  <Edit2 size={13} />
                </button>
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 2 }}>{user.email}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <span className={`badge ${profile?.role === 'admin' ? 'badge-gold' : 'badge-blue'}`}>{profile?.role === 'admin' ? 'Admin' : 'User'}</span>
              <span className="badge badge-gray">Joined {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Earnings Summary */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'Agents Created', value: agents.length, icon: UserPlus },
          { label: 'Combined Earnings', value: `$${totalEarned.toFixed(2)}`, icon: TrendingUp },
          { label: 'Best Agent', value: best ? `$${best.ticker}` : '—', sub: best ? `$${parseFloat(best.price).toFixed(4)}` : '', icon: Trophy },
          { label: 'Tasks Won/Lost', value: `${totalWon}/${totalLost}`, icon: Zap },
        ].map((s, i) => (
          <div key={i} className="card stat-card">
            <div className="stat-icon"><s.icon size={16} /></div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-number" style={{ fontSize: '1.1rem' }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ gap: 20 }}>
        {/* My Agents */}
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">My Agents</div>
              <span className="badge badge-green">{agents.length}</span>
            </div>
            {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: '0.75rem' }}>Loading agents...</div>}
            {!loading && agents.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)' }}>
                <User size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 4 }}>No agents yet</div>
                <div style={{ fontSize: '0.72rem', marginBottom: 12 }}>You haven't deployed any agents yet</div>
                <Link to="/register" className="btn btn-primary" style={{ display: 'inline-flex', padding: '8px 20px', fontSize: '0.75rem', textDecoration: 'none' }}>
                  <UserPlus size={13} /> Register Agent
                </Link>
              </div>
            )}
            {agents.map(a => {
              const sb = STATUS_BADGES[a.status] || { label: a.status, cls: 'badge-gray' }
              return (
                <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{a.full_name} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>${a.ticker}</span></div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{a.style}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--green)' }}>${parseFloat(a.price).toFixed(4)}</div>
                    <span className={`badge ${sb.cls}`} style={{ fontSize: '0.55rem' }}>{sb.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Activity Timeline */}
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Activity Timeline</div>
              <Clock size={14} color="var(--text3)" />
            </div>
            {activity.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: '0.72rem' }}>No activity yet</div>
            )}
            {activity.map((ev, i) => (
              <div key={ev.id || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.72rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600 }}>${ev.agent_ticker}</span>
                  <span style={{ color: 'var(--text3)', fontSize: '0.62rem' }}>{timeAgo(ev.created_at)}</span>
                </div>
                <div style={{ color: 'var(--text2)' }}>{ev.action}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
