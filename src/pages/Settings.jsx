import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  Save, CheckCircle, XCircle,
  UserPlus, Loader, Settings as SettingsIcon, Wallet,
  Upload, Eye, EyeOff, Copy, KeyRound
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AgentAvatar from '../components/AgentAvatar'

import { asArray } from '../lib/api'
import { API_BASE as API } from '../lib/config'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const MAX_STRATEGY_WORDS = 3000

function countWords(text) {
  const t = String(text || '').trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

function limitWords(text, max = MAX_STRATEGY_WORDS) {
  const raw = String(text || '')
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= max) return raw
  return parts.slice(0, max).join(' ')
}

// ── My Agents Editor ──────────────────────────────────────────────────────
function MyAgentsEditor({ userId }) {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({})
  const [statusByTicker, setStatusByTicker] = useState({})
  const [keyReveal, setKeyReveal] = useState({}) // { [ticker]: { loading, key, error } }
  const [copiedField, setCopiedField] = useState(null)
  const fileRefs = useRef({})

  useEffect(() => {
    let cancelled = false
    axios.get(`${API}/api/agents/mine/${userId}`)
      .then(r => {
        if (cancelled) return
        const list = asArray(r.data)
        setAgents(list)
        const seed = {}
        list.forEach(a => {
          seed[a.ticker] = {
            fullName: a.full_name || '',
            tradingStrategy: a.trading_strategy || '',
            avatarUrl: a.avatar_url || null,
            avatarPreview: a.avatar_url || null,
            avatarFile: null,
          }
        })
        setDrafts(seed)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  const updateDraft = (ticker, field, value) => {
    if (field === 'tradingStrategy') value = limitWords(value)
    if (field === 'fullName') {
      value = String(value).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12)
    }
    setDrafts(prev => ({ ...prev, [ticker]: { ...prev[ticker], [field]: value } }))
    setStatusByTicker(prev => ({ ...prev, [ticker]: null }))
  }

  const handleAvatarSelect = (ticker, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_AVATAR_SIZE) {
      setStatusByTicker(prev => ({ ...prev, [ticker]: { error: 'Image must be under 2MB' } }))
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setStatusByTicker(prev => ({ ...prev, [ticker]: { error: 'Only JPG, PNG, WebP, GIF allowed' } }))
      return
    }
    const preview = URL.createObjectURL(file)
    setDrafts(prev => ({
      ...prev,
      [ticker]: { ...prev[ticker], avatarFile: file, avatarPreview: preview },
    }))
    setStatusByTicker(prev => ({ ...prev, [ticker]: null }))
  }

  const isDirty = (a) => {
    const d = drafts[a.ticker] || {}
    return (
      (d.fullName || '') !== (a.full_name || '') ||
      (d.tradingStrategy || '') !== (a.trading_strategy || '') ||
      !!d.avatarFile
    )
  }

  const copyText = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch { /* ignore */ }
  }

  const toggleRevealKey = async (ticker) => {
    const current = keyReveal[ticker]
    if (current?.key) {
      setKeyReveal(prev => ({ ...prev, [ticker]: null }))
      return
    }
    setKeyReveal(prev => ({ ...prev, [ticker]: { loading: true } }))
    try {
      const r = await axios.post(`${API}/api/agents/${ticker}/reveal-key`, { userId })
      setKeyReveal(prev => ({
        ...prev,
        [ticker]: { key: r.data.privateKey, address: r.data.address },
      }))
    } catch (err) {
      setKeyReveal(prev => ({
        ...prev,
        [ticker]: { error: err.response?.data?.error || 'Failed to reveal key' },
      }))
    }
  }

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })

  const save = async (a) => {
    const d = drafts[a.ticker]
    if (!d) return
    setStatusByTicker(prev => ({ ...prev, [a.ticker]: 'saving' }))
    try {
      const payload = {
        userId,
        fullName: d.fullName,
        tradingStrategy: d.tradingStrategy,
      }
      if (d.avatarFile) {
        payload.avatarBase64 = await fileToBase64(d.avatarFile)
        payload.avatarContentType = d.avatarFile.type
        payload.avatarExt = d.avatarFile.name.split('.').pop()
      }

      const r = await axios.put(`${API}/api/agents/${a.ticker}`, payload)
      setAgents(prev => prev.map(x => x.ticker === a.ticker ? r.data : x))
      setDrafts(prev => ({
        ...prev,
        [a.ticker]: {
          fullName: r.data.full_name || '',
          tradingStrategy: r.data.trading_strategy || '',
          avatarUrl: r.data.avatar_url || null,
          avatarPreview: r.data.avatar_url || null,
          avatarFile: null,
        },
      }))
      setStatusByTicker(prev => ({ ...prev, [a.ticker]: 'saved' }))
      setTimeout(() => {
        setStatusByTicker(prev => ({ ...prev, [a.ticker]: null }))
      }, 1800)
    } catch (err) {
      setStatusByTicker(prev => ({
        ...prev,
        [a.ticker]: { error: err.response?.data?.error || err.message || 'Failed to save' },
      }))
    }
  }

  if (loading) {
    return (
      <div className="fade-in desk" style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
        Loading your agents...
      </div>
    )
  }

  return (
    <div className="fade-in desk">
      <div className="terminal-bar">
        <div>
          <div className="terminal-bar-title">Settings</div>
          <div className="terminal-bar-sub">Edit your deployed agents</div>
        </div>
      </div>

      {agents.length === 0 && (
        <div className="lane" style={{ textAlign: 'center', padding: 32 }}>
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

      <div className="settings-agents-grid">
        {agents.map(a => {
          const draft = drafts[a.ticker] || {
            fullName: '', tradingStrategy: '', avatarPreview: null, avatarFile: null,
          }
          const status = statusByTicker[a.ticker]
          const dirty = isDirty(a)
          const saving = status === 'saving'
          const saved = status === 'saved'
          const errorMsg = status && typeof status === 'object' ? status.error : null
          const revealed = keyReveal[a.ticker]
          const keyVisible = !!revealed?.key

          return (
            <div key={a.ticker} className="lane">
              <div className="lane-head" style={{ alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <AgentAvatar
                    ticker={a.ticker}
                    avatarUrl={draft.avatarPreview || a.avatar_url}
                    size="md"
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Tinos', serif", fontWeight: 800, fontSize: '0.95rem' }}>
                      {draft.fullName || a.full_name}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                      <span className="badge badge-green" style={{ fontSize: '0.6rem' }}>${a.ticker}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lane-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="register-field">
                  <label className="register-label">Profile picture</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      className="register-avatar-btn"
                      onClick={() => fileRefs.current[a.ticker]?.click()}
                      aria-label="Change profile picture"
                    >
                      {(draft.avatarPreview || a.avatar_url) ? (
                        <img
                          src={draft.avatarPreview || a.avatar_url}
                          alt=""
                          className="register-avatar-btn__img"
                        />
                      ) : (
                        <AgentAvatar ticker={a.ticker} size="lg" />
                      )}
                      <span className="register-avatar-btn__badge">
                        <Upload size={11} color="#fff" />
                      </span>
                    </button>
                    <div>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => fileRefs.current[a.ticker]?.click()}
                        style={{ fontSize: '0.65rem', padding: '4px 10px' }}
                      >
                        {draft.avatarFile ? 'Change' : 'Upload'}
                      </button>
                      <div className="register-hint" style={{ marginTop: 4 }}>
                        Max 2MB
                      </div>
                    </div>
                    <input
                      ref={el => { fileRefs.current[a.ticker] = el }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={e => handleAvatarSelect(a.ticker, e)}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>

                <div className="register-field">
                  <label className="register-label" htmlFor={`name-${a.ticker}`}>Name</label>
                  <input
                    id={`name-${a.ticker}`}
                    className="register-input settings-agent-name"
                    type="text"
                    placeholder="AGEX AGENT"
                    value={draft.fullName}
                    onChange={e => updateDraft(a.ticker, 'fullName', e.target.value)}
                    maxLength={12}
                    autoComplete="off"
                  />
                  <div className="register-hint">{(draft.fullName || '').length}/12</div>
                </div>

                <div className="register-field">
                  <label className="register-label">Trading Strategy</label>
                  <textarea
                    className="register-input register-textarea"
                    placeholder="How should this Agex agent trade?"
                    value={draft.tradingStrategy}
                    onChange={e => updateDraft(a.ticker, 'tradingStrategy', e.target.value)}
                    rows={8}
                  />
                  <div className="register-hint">{countWords(draft.tradingStrategy)}/{MAX_STRATEGY_WORDS} words</div>
                </div>

                <div className="register-field">
                  <label className="register-label">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <KeyRound size={11} /> Wallet key
                    </span>
                  </label>
                  {a.wallet_address && (
                    <div className="settings-agent-addr">
                      {a.wallet_address.slice(0, 10)}…{a.wallet_address.slice(-8)}
                    </div>
                  )}
                  {!keyVisible ? (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => toggleRevealKey(a.ticker)}
                      disabled={revealed?.loading}
                      style={{ fontSize: '0.68rem', padding: '5px 11px', gap: 5, alignSelf: 'flex-start' }}
                    >
                      {revealed?.loading
                        ? <Loader size={12} className="auth-spinner" />
                        : <Eye size={12} />}
                      {revealed?.loading ? 'Loading…' : 'Show key'}
                    </button>
                  ) : (
                    <div className="settings-agent-key-box">
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 6, gap: 6, flexWrap: 'wrap',
                      }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--gold)', fontWeight: 600 }}>
                          Keep secret
                        </span>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => copyText(revealed.key, `key-${a.ticker}`)}
                            style={{ fontSize: '0.6rem', padding: '3px 8px', gap: 3 }}
                          >
                            <Copy size={10} />
                            {copiedField === `key-${a.ticker}` ? 'Copied' : 'Copy'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => toggleRevealKey(a.ticker)}
                            style={{ fontSize: '0.6rem', padding: '3px 8px', gap: 3 }}
                          >
                            <EyeOff size={10} /> Hide
                          </button>
                        </div>
                      </div>
                      <code>{revealed.key}</code>
                    </div>
                  )}
                  {revealed?.error && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      color: 'var(--red)', fontSize: '0.68rem',
                    }}>
                      <XCircle size={12} /> {revealed.error}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => save(a)}
                    disabled={!dirty || saving}
                    style={{
                      padding: '7px 14px', fontSize: '0.72rem', gap: 6,
                      opacity: !dirty || saving ? 0.5 : 1,
                      cursor: !dirty || saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? <Loader size={12} className="auth-spinner" /> : <Save size={12} />}
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  {saved && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--green)', fontSize: '0.7rem' }}>
                      <CheckCircle size={12} /> Saved
                    </div>
                  )}
                  {errorMsg && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--red)', fontSize: '0.7rem' }}>
                      <XCircle size={12} /> {errorMsg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ── Main Settings Page ─────────────────────────────────────────────────────
export default function Settings() {
  const { user, loading, connectWallet } = useAuth()

  if (loading) {
    return (
      <div className="fade-in desk" style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="fade-in desk">
        <div className="terminal-bar">
          <div>
            <div className="terminal-bar-title">Settings</div>
            <div className="terminal-bar-sub">Connect your wallet to manage your agents</div>
          </div>
        </div>
        <div className="lane">
          <div className="lane-body" style={{ textAlign: 'center', padding: 32 }}>
            <SettingsIcon size={28} style={{ marginBottom: 10, color: 'var(--text3)' }} />
            <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 6 }}>
              Wallet Required
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: 16 }}>
              Connect your wallet to view and edit your deployed agents.
            </div>
            <button type="button" className="btn btn-primary" onClick={connectWallet}
              style={{ display: 'inline-flex', padding: '8px 20px', fontSize: '0.78rem' }}>
              <Wallet size={13} style={{ marginRight: 6 }} /> Connect Wallet
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <MyAgentsEditor userId={user.id} />
}
