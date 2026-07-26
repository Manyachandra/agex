import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Zap, CheckCircle, AlertCircle, Loader, Upload, Copy, KeyRound, AlertTriangle, Wallet } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal } from '../components/ScrollReveal'
import { useAccount } from 'wagmi'
import { API_BASE as API } from '../lib/config'

const MAX_FILE_SIZE = 2 * 1024 * 1024
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}
export default function Register() {
  const navigate = useNavigate()
  const { user, profile, connectWallet } = useAuth()
  const { address } = useAccount()
  const [form, setForm] = useState({
    name: '',
    ticker: '',
    tradingStrategy: '',
  })
  const [tickerStatus, setTickerStatus] = useState(null)
  const [tickerChecking, setTickerChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [txStatus, setTxStatus] = useState('')
  const [copiedField, setCopiedField] = useState(null)
  const fileInputRef = useRef(null)
  const tickerTimeout = useRef(null)

  const creatorName = profile?.username
    || (user?.id ? `Trader ${user.id.slice(2, 6).toUpperCase()}` : '')

  const copyToClipboard = (text, field) => {
    try {
      navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch { /* ignore */ }
  }

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) { setError('Image must be under 2MB'); return }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Only JPG, PNG, WebP, GIF allowed')
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setError(null)
  }

  const updateField = (field, value) => {
    setError(null)
    if (field === 'name') value = value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12)
    if (field === 'ticker') {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
      setTickerStatus(null)
    }
    if (field === 'tradingStrategy') value = limitWords(value)
    setForm(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    if (form.ticker.length < 2) { setTickerStatus(null); return }
    setTickerChecking(true)
    clearTimeout(tickerTimeout.current)
    tickerTimeout.current = setTimeout(async () => {
      try {
        const r = await axios.get(`${API}/api/agents/check-ticker/${form.ticker}`)
        setTickerStatus(r.data.available ? 'available' : 'taken')
      } catch { setTickerStatus(null) }
      setTickerChecking(false)
    }, 500)
    return () => clearTimeout(tickerTimeout.current)
  }, [form.ticker])

  const canSubmit = form.name.trim().length >= 2 && form.ticker.length >= 2 &&
    tickerStatus === 'available' && !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    if (!user) { setShowWalletModal(true); return }

    setSubmitting(true)
    setError(null)
    await submitAgent()
  }

  const submitAgent = async () => {
    try {
      setTxStatus('Registering agent...')
      const payload = {
        name: form.name,
        ticker: form.ticker,
        tradingStrategy: form.tradingStrategy || null,
        creatorName: creatorName || null,
        createdBy: user.id,
        userWallet: (address || user.id || '').toLowerCase() || null,
      }
      if (avatarFile) {
        payload.avatarBase64 = await fileToBase64(avatarFile)
        payload.avatarContentType = avatarFile.type
        payload.avatarExt = avatarFile.name.split('.').pop()
      }
      const r = await axios.post(`${API}/api/agents/register`, payload)
      setSuccess(r.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Try again.')
    }
    setSubmitting(false)
    setTxStatus('')
  }

  const resetForm = () => {
    setSuccess(null)
    setForm({ name: '', ticker: '', tradingStrategy: '' })
    setTickerStatus(null)
    setAvatarFile(null)
    setAvatarPreview(null)
  }

  if (success) {
    return (
      <div className="fade-in desk">
        <ScrollReveal delay={0}>
          <div className="terminal-bar">
            <div>
              <div className="terminal-bar-title">Agent Deployed!</div>
              <div className="terminal-bar-sub">Your agent is now live on the exchange</div>
            </div>
          </div>
          <div className="lane register-success">
            <div style={{ margin: '8px 0 16px' }}>
              <CheckCircle size={44} color="var(--gold)" />
            </div>
            <div style={{ fontFamily: "'Tinos', serif", fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>
              {success.full_name}
            </div>
            <div className="badge badge-green" style={{ display: 'inline-block', fontSize: '0.85rem', padding: '4px 16px', marginBottom: 16 }}>
              ${success.ticker} — Live
            </div>
            <div className="register-callout register-callout--gold">
              Your agent is live. Fund its wallet with real ETH (at least $2) and it will start trading on Robinhood Chain once DEX routing is live.
            </div>
            {success?.agentWallet && (
              <div className="register-wallet-box">
                <div className="register-wallet-box__head">
                  <KeyRound size={15} color="var(--blue)" />
                  <span>Your Agent's Wallet</span>
                </div>
                <div className="register-wallet-box__warn">
                  <AlertTriangle size={14} color="var(--gold)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Save this private key now. It is shown <strong>only once</strong> and gives full control of this
                    agent's on-chain funds. Never share it. We cannot recover it for you.
                  </span>
                </div>

                <div className="register-wallet-box__label">Wallet Address</div>
                <div className="register-wallet-box__row">
                  <code>{success.agentWallet.address}</code>
                  <button type="button" onClick={() => copyToClipboard(success.agentWallet.address, 'addr')}
                    className="btn btn-outline register-wallet-box__copy">
                    <Copy size={11} /> {copiedField === 'addr' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="register-wallet-box__label">Private Key</div>
                <div className="register-wallet-box__row register-wallet-box__row--secret">
                  <code>{success.agentWallet.privateKey}</code>
                  <button type="button" onClick={() => copyToClipboard(success.agentWallet.privateKey, 'pk')}
                    className="btn btn-outline register-wallet-box__copy register-wallet-box__copy--secret">
                    <Copy size={11} /> {copiedField === 'pk' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <button type="button" className="btn btn-primary" style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '12px 0' }}
              onClick={() => navigate('/profile')}>
              View My Profile
            </button>
            <button type="button" className="btn btn-outline" style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '12px 0' }}
              onClick={resetForm}>
              Register Another Agent
            </button>
          </div>
        </ScrollReveal>
      </div>
    )
  }

  const previewName = form.name
    ? `Agent ${form.name.charAt(0) + form.name.slice(1).toLowerCase()}`
    : 'Agent Name'

  return (
    <div className="fade-in desk">
      <ScrollReveal delay={0}>
        <div className="terminal-bar">
          <div>
            <div className="terminal-bar-title">Register Agent</div>
            <div className="terminal-bar-sub">Name it, pick a ticker, deploy to Robinhood Chain</div>
          </div>
        </div>
      </ScrollReveal>

      {showWalletModal && (
        <div className="modal-overlay" onClick={() => setShowWalletModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <Wallet size={32} color="var(--green)" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: "'Tinos', serif", fontWeight: 800, fontSize: '1.1rem', marginBottom: 6 }}>
              Wallet Required
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 20, lineHeight: 1.6 }}>
              Connect your wallet to deploy an agent on the Agex exchange.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { setShowWalletModal(false); connectWallet() }}
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
            >
              <Wallet size={14} /> Connect Wallet
            </button>
          </div>
        </div>
      )}

      <ScrollReveal delay={80}>
        <div className="register-layout">
          <form className="lane register-form register-form--clean" onSubmit={handleSubmit}>
            <div className="register-identity">
              <button
                type="button"
                className="register-avatar-btn"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload agent avatar"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="register-avatar-btn__img" />
                ) : (
                  <AgentAvatar ticker={form.ticker || '??'} size="lg" />
                )}
                <span className="register-avatar-btn__badge">
                  <Upload size={11} color="#fff" />
                </span>
              </button>
              <div className="register-identity__copy">
                <div className="register-identity__title">Agent identity</div>
                <div className="register-identity__sub">
                  {avatarFile ? avatarFile.name : 'Optional avatar · JPG, PNG, WebP, GIF · max 2MB'}
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ fontSize: '0.68rem', padding: '5px 12px', marginTop: 8 }}
                >
                  {avatarFile ? 'Change image' : 'Upload image'}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarSelect}
                style={{ display: 'none' }}
              />
            </div>

            <div className="register-row">
              <div className="register-field">
                <label className="register-label" htmlFor="agent-name">Name</label>
                <input
                  id="agent-name"
                  className="register-input"
                  type="text"
                  placeholder="AGEX"
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  maxLength={12}
                  autoComplete="off"
                />
                <div className="register-hint">{form.name.length}/12</div>
              </div>

              <div className="register-field">
                <label className="register-label" htmlFor="agent-ticker">Ticker</label>
                <div className="register-ticker-wrap">
                  <span className="register-ticker-prefix">$</span>
                  <input
                    id="agent-ticker"
                    className="register-input register-input--ticker"
                    type="text"
                    placeholder="AGX"
                    value={form.ticker}
                    onChange={e => updateField('ticker', e.target.value)}
                    maxLength={6}
                    autoComplete="off"
                    style={{
                      borderColor: tickerStatus === 'taken' ? 'var(--red)' : tickerStatus === 'available' ? 'var(--green)' : undefined,
                    }}
                  />
                  <span className="register-ticker-status">
                    {tickerChecking && <Loader size={14} color="var(--text3)" style={{ animation: 'spin 1s linear infinite' }} />}
                    {!tickerChecking && tickerStatus === 'available' && <CheckCircle size={14} color="var(--green)" />}
                    {!tickerChecking && tickerStatus === 'taken' && <AlertCircle size={14} color="var(--red)" />}
                  </span>
                </div>
                {tickerStatus === 'taken' && (
                  <div className="register-hint" style={{ color: 'var(--red)' }}>${form.ticker} is taken</div>
                )}
                {tickerStatus === 'available' && (
                  <div className="register-hint" style={{ color: 'var(--green)' }}>${form.ticker} is available</div>
                )}
                {!tickerStatus && (
                  <div className="register-hint">{form.ticker.length}/6 · unique on the exchange</div>
                )}
              </div>
            </div>

            <div className="register-field">
              <label className="register-label" htmlFor="agent-strategy">
                Trading strategy <span className="register-label-optional">optional</span>
              </label>
              <textarea
                id="agent-strategy"
                className="register-input register-textarea"
                placeholder="How should this Agex agent behave in the market?"
                value={form.tradingStrategy}
                onChange={e => updateField('tradingStrategy', e.target.value)}
                rows={8}
              />
              <div className="register-hint">{countWords(form.tradingStrategy)}/{MAX_STRATEGY_WORDS} words</div>
            </div>

            {error && (
              <div className="register-callout register-callout--error">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary register-submit"
              disabled={!canSubmit}
            >
              {submitting
                ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <Zap size={14} />}
              {txStatus || (submitting ? 'Processing...' : 'Deploy Agent')}
            </button>
          </form>

          <aside className="register-aside">
            <div className="lane register-preview">
              <div className="register-preview__label">Preview</div>
              <div className="register-preview-top">
                <AgentAvatar ticker={form.ticker || '??'} avatarUrl={avatarPreview} size="lg" />
                <div>
                  <div className={`register-preview-name ${form.name ? '' : 'is-empty'}`}>
                    {previewName}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                    <span className="badge badge-green">${form.ticker || 'TICK'}</span>
                    <span className="badge badge-gold">NEW</span>
                  </div>
                </div>
              </div>
              <div className="register-preview-stats">
                <div>
                  <div className="register-preview-stat-label">Start price</div>
                  <div className="register-preview-stat-value" style={{ color: 'var(--green)' }}>$1.00</div>
                </div>
                <div>
                  <div className="register-preview-stat-label">Wallet</div>
                  <div className="register-preview-stat-value">$0.00</div>
                </div>
              </div>
              {form.tradingStrategy ? (
                <div className="register-preview-strategy">
                  <div className="register-preview-stat-label">Strategy</div>
                  <p>{form.tradingStrategy}</p>
                </div>
              ) : (
                <p className="register-preview-empty">Add a strategy to show how this agent trades.</p>
              )}
            </div>

            <div className="lane register-steps">
              <div className="register-preview__label">After deploy</div>
              <ol>
                <li>A Robinhood Chain wallet is created for the agent</li>
                <li>Fund it with ETH from your profile</li>
                <li>It trades on-chain when DEX routing is live</li>
              </ol>
            </div>
          </aside>
        </div>
      </ScrollReveal>
    </div>
  )
}
