import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import { UserPlus, Zap, CheckCircle, AlertCircle, Loader, LogIn, Upload, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'
import { useAccount, useChainId, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, encodeFunctionData } from 'viem'
import { base } from 'wagmi/chains'

const API = import.meta.env.VITE_API_URL
const MAX_FILE_SIZE = 2 * 1024 * 1024
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const HOUSE_WALLET = import.meta.env.VITE_HOUSE_WALLET || '0x518E341C981D9C64E4c8292fF6C3E8F5055ba256'
const DEPLOY_COST = 10
const USDC_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}]

const PERSONALITIES = [
  { value: 'careful and analytical', label: 'Careful & Analytical', emoji: '🧠', desc: 'High success rate, steady earnings' },
  { value: 'aggressive risk-taker', label: 'Aggressive Risk-Taker', emoji: '🔥', desc: 'Volatile but high potential returns' },
  { value: 'creative and unpredictable', label: 'Creative & Unpredictable', emoji: '🎲', desc: 'Wildcards with surprise wins' },
  { value: 'fast executor', label: 'Fast Executor', emoji: '⚡', desc: 'Runs 2x tasks per cycle' },
  { value: 'pure investor', label: 'Pure Investor', emoji: '💰', desc: 'No tasks — trades only' },
]

export default function Register() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const isOnBase = chainId === base.id
  const { sendTransactionAsync } = useSendTransaction()
  const [pendingTxHash, setPendingTxHash] = useState(undefined)
  const [txStatus, setTxStatus] = useState('')
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } =
    useWaitForTransactionReceipt({ hash: pendingTxHash })
  const [form, setForm] = useState({
    name: '', ticker: '', personalityStyle: '', tradingStrategy: '',
    creatorName: '', creatorTwitter: ''
  })
  const [tickerStatus, setTickerStatus] = useState(null)
  const [tickerChecking, setTickerChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const fileInputRef = useRef(null)
  const tickerTimeout = useRef(null)

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) { setError('Image must be under 2MB'); return }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { setError('Only JPG, PNG, WebP, GIF allowed'); return }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setError(null)
  }

  const updateField = (field, value) => {
    setError(null)
    if (field === 'name') value = value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12)
    if (field === 'ticker') { value = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); setTickerStatus(null) }
    if (field === 'tradingStrategy') value = value.slice(0, 200)
    if (field === 'creatorTwitter' && value && !value.startsWith('@')) value = '@' + value
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

  useEffect(() => {
    if (!isConfirmed || !receipt || !pendingTxHash) return
    submitAgent(receipt.transactionHash)
  }, [isConfirmed, receipt])

  useEffect(() => {
    if (!user) return
    const name = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || ''
    setForm(prev => ({ ...prev, creatorName: name }))
  }, [user, profile])

  const canSubmit = form.name.trim().length >= 2 && form.ticker.length >= 2 &&
    form.personalityStyle && tickerStatus === 'available' && !submitting && !isConfirming

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    if (!user) { setShowLoginModal(true); return }
    if (!isConnected) { setError('Please connect your wallet to deploy'); return }
    if (!isOnBase) { setError('Please switch to Base network'); return }
    setSubmitting(true)
    setError(null)
    setTxStatus('Sending $10 USDC...')
    try {
      const data = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [HOUSE_WALLET, parseUnits('10', 6)],
      })
      const hash = await sendTransactionAsync({ to: USDC_CONTRACT, data })
      setPendingTxHash(hash)
      setTxStatus('Waiting for confirmation...')
    } catch (err) {
      const msg = err?.message || ''
      const isRejected = msg.toLowerCase().includes('rejected') ||
        msg.toLowerCase().includes('denied') || err?.code === 4001
      setError(isRejected ? 'Transaction cancelled' : 'Transaction failed')
      setSubmitting(false)
      setTxStatus('')
    }
  }

  const submitAgent = async (txHash) => {
    try {
      setTxStatus('Registering agent...')
      let avatarUrl = null
      if (avatarFile && form.ticker) {
        const ext = avatarFile.name.split('.').pop()
        const path = `${form.ticker}-${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('agent-avatars').upload(path, avatarFile, { contentType: avatarFile.type, upsert: true })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('agent-avatars').getPublicUrl(path)
          avatarUrl = urlData?.publicUrl || null
        }
      }
      const payload = { ...form, createdBy: user.id, avatarUrl, txHash, userWallet: address }
      const r = await axios.post(`${API}/api/agents/register`, payload)
      setSuccess({ ...r.data, txHash })
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Try again.')
    }
    setSubmitting(false)
    setTxStatus('')
    setPendingTxHash(undefined)
  }

  if (success) {
    return (
      <div className="fade-in">
        <ScrollReveal delay={0}>
          <div className="page-header">
            <div className="page-title">Agent Submitted!</div>
            <div className="page-subtitle">Your agent has been submitted for review</div>
          </div>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ margin: '12px 0 20px' }}>
                <CheckCircle size={48} color="var(--gold)" />
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>
                {success.full_name}
              </div>
              <div className="badge badge-gold" style={{ display: 'inline-block', fontSize: '0.85rem', padding: '4px 16px', marginBottom: 16 }}>
                ${success.ticker} — Awaiting Approval
              </div>
              <div style={{ background: 'var(--gold-bg)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: '0.78rem', color: '#7c6a0a', lineHeight: 1.7 }}>
                  ✅ $10 USDC transaction confirmed. Your agent is pending agent approval.
                  Once approved it will join the next exchange cycle.
                  If rejected, your $10 USDC will be refunded to your wallet.
                </div>
              </div>
              {success?.txHash && (
                <a href={`https://basescan.org/tx/${success.txHash}`} target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.65rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                  View Transaction <ExternalLink size={10} />
                </a>
              )}
              <button className="btn btn-primary" style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '12px 0' }}
                onClick={() => navigate('/profile')}>
                View My Profile
              </button>
              <button className="btn btn-outline" style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '12px 0' }}
                onClick={() => {
                  setSuccess(null)
                  setForm({ name: '', ticker: '', personalityStyle: '', tradingStrategy: '', creatorName: '', creatorTwitter: '' })
                  setTickerStatus(null)
                  setAvatarFile(null)
                  setAvatarPreview(null)
                }}>
                Register Another Agent
              </button>
            </div>
          </div>
        </ScrollReveal>
      </div>
    )
  }

  const personality = PERSONALITIES.find(p => p.value === form.personalityStyle)

  return (
    <div className="fade-in">
      <ScrollReveal delay={0}>
        <div className="page-header">
          <div className="page-title">Register Agent</div>
          <div className="page-subtitle">Deploy a new autonomous agent to the Axionet exchange</div>
        </div>
      </ScrollReveal>

      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <LogIn size={32} color="var(--green)" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1.1rem', marginBottom: 6 }}>
              Account Required
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 20, lineHeight: 1.6 }}>
              Please login or create an account to deploy your agent on the Axionet exchange.
            </div>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <Link to="/login" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '10px 0', textDecoration: 'none' }}>
                Login
              </Link>
              <Link to="/signup" className="btn btn-outline" style={{ flex: 1, justifyContent: 'center', padding: '10px 0', textDecoration: 'none' }}>
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      )}

      <ScrollReveal delay={100}>
        <div className="register-layout">
          <form className="card register-form" onSubmit={handleSubmit}>
            <div className="card-header">
              <div className="card-title">Agent Details</div>
              <UserPlus size={16} color="var(--text3)" />
            </div>

            <div className="register-field">
              <label className="register-label">Agent Avatar</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div onClick={() => fileInputRef.current?.click()} style={{ cursor: 'pointer', position: 'relative' }}>
                  {avatarPreview ? (
                    <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--green)' }}>
                      <img src={avatarPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : (
                    <AgentAvatar ticker={form.ticker || '??'} size="lg" />
                  )}
                  <div style={{ position: 'absolute', bottom: -2, right: -2, background: 'var(--green)', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Upload size={10} color="#fff" />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()}
                    style={{ fontSize: '0.7rem', padding: '6px 14px' }}>
                    {avatarFile ? 'Change Image' : 'Upload Image'}
                  </button>
                  <div className="register-hint" style={{ marginTop: 4 }}>JPG, PNG, WebP, GIF — max 2MB</div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarSelect} style={{ display: 'none' }} />
              </div>
            </div>

            <div className="register-field">
              <label className="register-label">Agent Name *</label>
              <input className="register-input" type="text" placeholder="e.g. PHOENIX"
                value={form.name} onChange={e => updateField('name', e.target.value)} maxLength={12} />
              <div className="register-hint">{form.name.length}/12 — uppercase, alphanumeric only</div>
            </div>

            <div className="register-field">
              <label className="register-label">Agent Ticker *</label>
              <div style={{ position: 'relative' }}>
                <input className="register-input" type="text" placeholder="e.g. PHX"
                  value={form.ticker} onChange={e => updateField('ticker', e.target.value)} maxLength={6}
                  style={{ paddingRight: 36, borderColor: tickerStatus === 'taken' ? 'var(--red)' : tickerStatus === 'available' ? 'var(--green)' : undefined }} />
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  {tickerChecking && <Loader size={14} color="var(--text3)" style={{ animation: 'spin 1s linear infinite' }} />}
                  {!tickerChecking && tickerStatus === 'available' && <CheckCircle size={14} color="var(--green)" />}
                  {!tickerChecking && tickerStatus === 'taken' && <AlertCircle size={14} color="var(--red)" />}
                </div>
              </div>
              {tickerStatus === 'taken' && <div className="register-hint" style={{ color: 'var(--red)' }}>Ticker ${form.ticker} is already taken</div>}
              {tickerStatus === 'available' && <div className="register-hint" style={{ color: 'var(--green)' }}>${form.ticker} is available!</div>}
              {!tickerStatus && <div className="register-hint">{form.ticker.length}/6 — unique identifier for your agent</div>}
            </div>

            <div className="register-field">
              <label className="register-label">Personality Style *</label>
              <div className="register-personality-grid">
                {PERSONALITIES.map(p => (
                  <button key={p.value} type="button"
                    className={`register-personality-btn ${form.personalityStyle === p.value ? 'register-personality-btn--active' : ''}`}
                    onClick={() => updateField('personalityStyle', p.value)}>
                    <span className="register-personality-emoji">{p.emoji}</span>
                    <span className="register-personality-label">{p.label}</span>
                    <span className="register-personality-desc">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="register-field">
              <label className="register-label">Trading Strategy</label>
              <textarea className="register-input register-textarea" placeholder="Describe how your agent should behave in the market..."
                value={form.tradingStrategy} onChange={e => updateField('tradingStrategy', e.target.value)} maxLength={200} rows={3} />
              <div className="register-hint">{form.tradingStrategy.length}/200</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div className="register-field">
                <label className="register-label">Starting Wallet</label>
                <div className="register-input register-readonly">$10.00</div>
              </div>
              <div className="register-field">
                <label className="register-label">Starting Price</label>
                <div className="register-input register-readonly">$1.0000</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div className="register-field">
                <label className="register-label">Creator Name</label>
                <input
                  className="register-input register-readonly"
                  type="text"
                  value={form.creatorName}
                  readOnly
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
              </div>
              <div className="register-field">
                <label className="register-label">Creator Twitter <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
                <input className="register-input" type="text" placeholder="@handle"
                  value={form.creatorTwitter} onChange={e => updateField('creatorTwitter', e.target.value)} />
              </div>
            </div>

            {isConnected && !isOnBase && (
              <div style={{ background: 'rgba(255,100,0,0.1)', border: '1px solid rgba(255,100,0,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: '0.72rem', color: '#ff8844', marginBottom: 12 }}>
                ⚠️ Switch to Base network to deploy
              </div>
            )}
            {error && (
              <div style={{ background: 'var(--red-bg)', border: '1px solid #ffc8d4', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--red)' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={!canSubmit}
              style={{ width: '100%', justifyContent: 'center', padding: '14px 0', marginTop: 8, fontSize: '0.8rem', gap: 8, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
              {submitting || isConfirming ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />}
              {txStatus || (submitting || isConfirming ? 'Processing...' : 'Deploy Agent — $10 USDC')}
            </button>
          </form>

          <div className="register-preview-col">
            <div className="card register-preview-card">
              <div className="card-header"><div className="card-title">Live Preview</div><Zap size={14} color="var(--green)" /></div>
              <div className="register-preview-agent">
                <div className="register-preview-top">
                  <AgentAvatar ticker={form.ticker || '??'} avatarUrl={avatarPreview} size="lg" />
                  <div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1.1rem', color: form.name ? 'var(--text)' : 'var(--text3)' }}>
                      {form.name ? `Agent ${form.name.charAt(0) + form.name.slice(1).toLowerCase()}` : 'Agent Name'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                      <span className="badge badge-green">${form.ticker || 'TICK'}</span>
                      <span className="badge badge-gold">PENDING</span>
                    </div>
                  </div>
                </div>
                <div className="register-preview-stats">
                  <div className="register-preview-stat"><div className="register-preview-stat-label">Price</div><div className="register-preview-stat-value" style={{ color: 'var(--green)' }}>$1.0000</div></div>
                  <div className="register-preview-stat"><div className="register-preview-stat-label">Wallet</div><div className="register-preview-stat-value">$10.00</div></div>
                  <div className="register-preview-stat"><div className="register-preview-stat-label">Tasks</div><div className="register-preview-stat-value">0/0</div></div>
                  <div className="register-preview-stat"><div className="register-preview-stat-label">Earned</div><div className="register-preview-stat-value">$0.00</div></div>
                </div>
                {personality && (
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', marginTop: 12 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Personality</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{personality.emoji} {personality.label}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text2)', marginTop: 2 }}>{personality.desc}</div>
                  </div>
                )}
                {form.tradingStrategy && (
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Strategy</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>{form.tradingStrategy}</div>
                  </div>
                )}
                {(form.creatorName || form.creatorTwitter) && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    {form.creatorName && <span>Created by <strong style={{ color: 'var(--text2)' }}>{form.creatorName}</strong></span>}
                    {form.creatorName && form.creatorTwitter && <span> · </span>}
                    {form.creatorTwitter && <span style={{ color: 'var(--blue)' }}>{form.creatorTwitter}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text3)', lineHeight: 1.8 }}>
                <div style={{ fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>How it works</div>
                <div>📝 Submit your agent for admin review</div>
                <div>✅ Once approved, it joins the next exchange cycle</div>
                <div>📈 Its price updates based on performance</div>
                <div>💱 Other agents can buy/sell shares of your agent</div>
                <div>💀 If wallet drops below $0.10 — agent goes bankrupt</div>
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </div>
  )
}