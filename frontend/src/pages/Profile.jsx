import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { User, Trophy, Zap, TrendingUp, Clock, UserPlus, Edit2, Save, Loader, ChevronDown, ChevronUp, Plus, Minus, Gift, Wallet, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AgentAvatar from '../components/AgentAvatar'
import { useAccount, useChainId, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { base } from 'wagmi/chains'

const API = import.meta.env.VITE_API_URL
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const HOUSE_WALLET = import.meta.env.VITE_HOUSE_WALLET || '0x518E341C981D9C64E4c8292fF6C3E8F5055ba256'

// USDC transfer ABI — only transfer function
const USDC_ABI = [{
  name: 'transfer',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ type: 'bool' }],
}]

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
// ── Fund Modal ────────────────────────────────────────────────────────────────
function FundModal({ agent, type, onClose, onSuccess, userId }) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const isOnBase = chainId === base.id

  const [amount, setAmount] = useState('')
  const [txStatus, setTxStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successData, setSuccessData] = useState(null)
  const [pendingTxHash, setPendingTxHash] = useState(undefined)

  const isAdd = type === 'add'
  const isRemove = type === 'remove'
  const isReward = type === 'reward'
  const title = isAdd ? 'Add Funds' : isRemove ? 'Remove Funds' : 'Withdraw Rewards'
  const usdcOut = isReward ? ((parseFloat(amount || 0) / 100) * 5).toFixed(4) : null

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } =
    useWaitForTransactionReceipt({ hash: pendingTxHash })

  // After USDC tx confirmed — record add fund
  useEffect(() => {
    if (!isConfirmed || !receipt || !isAdd || !loading) return
    async function recordAdd() {
      try {
        setTxStatus('Recording transaction...')
        const res = await axios.post(`${API}/api/funds/add`, {
          agentTicker: agent.ticker,
          userWallet: address,
          userId,
          amount: parseFloat(amount),
          txHash: receipt.transactionHash,
        })
        if (res.data.success) {
          setSuccessData({ type: 'add', amount: parseFloat(amount), txHash: receipt.transactionHash })
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to record transaction')
      }
      setLoading(false)
      setTxStatus('')
      setPendingTxHash(undefined)
    }
    recordAdd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, receipt])

  const handleAdd = async () => {
    setError('')
    const parsed = parseFloat(amount)
    if (!parsed || parsed < 1) { setError('Minimum $1'); return }
    if (!isConnected) { setError('Please connect your wallet'); return }
    if (!isOnBase) { setError('Please switch to Base network'); return }

    setLoading(true)
    setTxStatus('Sending USDC to house wallet...')
    try {
      // Encode USDC transfer call
      const { encodeFunctionData } = await import('viem')
      const data = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [HOUSE_WALLET, parseUnits(parsed.toFixed(6), 6)],
      })
      const hash = await sendTransactionAsync({ to: USDC_CONTRACT, data })
      setPendingTxHash(hash)
      setTxStatus('Waiting for confirmation...')
    } catch (err) {
      const msg = err?.message || ''
      const isRejected = msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied') || err?.code === 4001
      setError(isRejected ? 'Transaction cancelled' : (msg || 'Transaction failed'))
      setLoading(false)
      setTxStatus('')
    }
  }

  const handleRemoveOrReward = async () => {
    setError('')
    const parsed = parseFloat(amount)
    if (!parsed || parsed < 1) { setError('Minimum $1'); return }
    if (!isConnected) { setError('Please connect your wallet'); return }

    setLoading(true)
    try {
      const endpoint = isRemove ? `${API}/api/funds/remove` : `${API}/api/funds/withdraw-rewards`
      const res = await axios.post(endpoint, {
        agentTicker: agent.ticker,
        userWallet: address,
        userId,
        amount: parsed
      })
      if (res.data.success) {
        setSuccessData({
          type: isRemove ? 'remove' : 'reward',
          amount: parsed,
          txHash: res.data.txHash,
          usdcPayout: res.data.usdcPayout
        })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    }
    setLoading(false)
  }

  const isProcessing = loading || isSending || isConfirming

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1rem' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* Success State */}
        {successData ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
              {successData.type === 'add' ? 'Funds Added!' : successData.type === 'remove' ? 'Funds Removed!' : 'Rewards Withdrawn!'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 10 }}>
              {successData.type === 'add' && `$${successData.amount.toFixed(2)} added to agent wallet`}
              {successData.type === 'remove' && `$${successData.amount.toFixed(2)} sent as USDC to your wallet`}
              {successData.type === 'reward' && `${successData.usdcPayout} USDC sent to your wallet`}
            </div>
            {successData.txHash && (
              <a href={`https://basescan.org/tx/${successData.txHash}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '0.65rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                View on BaseScan <ExternalLink size={10} />
              </a>
            )}
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => onSuccess()} style={{ padding: '8px 24px', fontSize: '0.78rem' }}>Done</button>
            </div>
          </div>

) : !isConnected ? (
  <div style={{ textAlign: 'center', padding: '24px 0' }}>
    <Wallet size={32} style={{ color: 'var(--text3)', marginBottom: 12 }} />
    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Wallet Not Connected</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Use the wallet button in the header to connect</div>
  </div>

) : (
          <>
            {/* Agent info */}
            <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>${agent.ticker}</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{isReward ? 'Total Earned' : 'Wallet Balance'}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--green)' }}>
                  ${isReward ? parseFloat(agent.total_earned || 0).toFixed(2) : parseFloat(agent.wallet || 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Network warning */}
            {!isOnBase && isAdd && (
              <div style={{ background: 'rgba(255,100,0,0.1)', border: '1px solid rgba(255,100,0,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.72rem', color: '#ff8844' }}>
                ⚠️ Please switch to Base network to send USDC
              </div>
            )}

            {/* Info box */}
            {isAdd && (
              <div style={{ background: 'rgba(0,200,100,0.08)', border: '1px solid rgba(0,200,100,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.72rem' }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>USDC will be sent from your wallet</div>
                <div style={{ color: 'var(--text3)' }}>Network: Base • Token: USDC • Min: $1</div>
              </div>
            )}
            {isReward && (
              <div style={{ background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.72rem' }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Conversion Rate</div>
                <div style={{ color: 'var(--text3)' }}>$100 in-game earned = $5 USDC</div>
                {amount && parseFloat(amount) >= 1 && (
                  <div style={{ marginTop: 6, fontWeight: 700, color: 'var(--green)' }}>
                    ${parseFloat(amount).toFixed(2)} → {usdcOut} USDC
                  </div>
                )}
              </div>
            )}

            {/* Amount input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Amount (USDC) — min $1</label>
              <input
                className="register-input"
                type="number" min="1" step="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
              />
            </div>

            {/* TX Status */}
            {txStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--text3)', marginBottom: 10 }}>
                <Loader size={12} className="auth-spinner" /> {txStatus}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: '0.72rem', color: '#ff5555', marginBottom: 14 }}>
                {error}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" onClick={onClose} style={{ flex: 1, padding: '9px', fontSize: '0.78rem' }} disabled={isProcessing}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={isAdd ? handleAdd : handleRemoveOrReward}
                disabled={isProcessing || !amount || parseFloat(amount) < 1}
                style={{ flex: 1, padding: '9px', fontSize: '0.78rem', background: isRemove ? '#ff4444' : isReward ? '#f0a500' : 'var(--green)' }}
              >
                {isProcessing
                  ? <><Loader size={13} className="auth-spinner" /> Processing...</>
                  : isAdd ? 'Send USDC' : isRemove ? 'Remove Funds' : 'Withdraw USDC'
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Withdraw All Rewards Modal ─────────────────────────────────────────────
function WithdrawAllModal({ agents, onClose, userId }) {
  const { address, isConnected } = useAccount()
  const [selectedAgent, setSelectedAgent] = useState(agents[0]?.ticker || '')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)

  const agent = agents.find(a => a.ticker === selectedAgent)
  const totalEarned = agent ? parseFloat(agent.total_earned || 0) : 0
  const usdcOut = ((parseFloat(amount || 0) / 100) * 5).toFixed(4)

  const handleSubmit = async () => {
    setError('')
    const parsed = parseFloat(amount)
    if (!parsed || parsed < 1) { setError('Minimum $1'); return }
    if (parsed > totalEarned) { setError('Exceeds available earned balance'); return }
    if (!isConnected || !address) { setError('Please connect your wallet'); return }

    setLoading(true)
    try {
      const res = await axios.post(`${API}/api/funds/withdraw-rewards`, {
        agentTicker: selectedAgent,
        userWallet: address,
        userId,
        amount: parsed
      })
      if (res.data.success) setSuccess({ usdcPayout: res.data.usdcPayout, txHash: res.data.txHash })
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    }
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1rem' }}>Withdraw Rewards</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '1.2rem' }}>✕</button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>Withdrawal Successful!</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 10 }}>{success.usdcPayout} USDC sent to your wallet</div>
            {success.txHash && (
              <a href={`https://basescan.org/tx/${success.txHash}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '0.65rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                View on BaseScan <ExternalLink size={10} />
              </a>
            )}
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={onClose} style={{ padding: '8px 24px', fontSize: '0.78rem' }}>Done</button>
            </div>
          </div>

) : !isConnected ? (
  <div style={{ textAlign: 'center', padding: '24px 0' }}>
    <Wallet size={32} style={{ color: 'var(--text3)', marginBottom: 12 }} />
    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Wallet Not Connected</div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Use the wallet button in the header to connect</div>
  </div>

) : (
          <>
            <div style={{ background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.72rem' }}>
              <span style={{ fontWeight: 700 }}>Rate: </span>
              <span style={{ color: 'var(--text3)' }}>$100 in-game = $5 USDC</span>
              {amount && parseFloat(amount) >= 1 && (
                <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--green)' }}>→ {usdcOut} USDC</span>
              )}
            </div>

            {agents.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Select Agent</label>
                <select className="register-input" value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.78rem' }}>
                  {agents.map(a => (
                    <option key={a.ticker} value={a.ticker}>${a.ticker} — ${parseFloat(a.total_earned || 0).toFixed(2)} earned</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Available</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--green)' }}>${totalEarned.toFixed(2)}</span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Amount ($) — min $1</label>
              <input className="register-input" type="number" min="1" step="1" value={amount}
                onChange={e => setAmount(e.target.value)} placeholder="Enter amount"
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }} />
            </div>

            {error && (
              <div style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: '0.72rem', color: '#ff5555', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" onClick={onClose} style={{ flex: 1, padding: '9px', fontSize: '0.78rem' }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}
                style={{ flex: 1, padding: '9px', fontSize: '0.78rem', background: '#f0a500' }}>
                {loading ? <><Loader size={13} className="auth-spinner" /> Processing...</> : 'Withdraw USDC'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Profile ──────────────────────────────────────────────────────────────
export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedAgent, setExpandedAgent] = useState(null)
  const [fundModal, setFundModal] = useState(null) // { agent, type }
  const [showWithdrawAll, setShowWithdrawAll] = useState(false)
  const [activityPage, setActivityPage] = useState(1)
  const [fundHistory, setFundHistory] = useState([])

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    fetchData()
  }, [user, navigate])

  const fetchData = async () => {
    const [a, act, funds] = await Promise.all([
      axios.get(`${API}/api/admin/my-agents/${user.id}`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/activity`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/funds/history/user/${user.id}`).catch(() => ({ data: [] })),
    ])
    setAgents(a.data || [])
    const tickers = (a.data || []).map(ag => ag.ticker)
    const myActivity = (act.data || []).filter(ev => tickers.includes(ev.agent_ticker)).slice(0, 50)
    setActivity(myActivity)
    setFundHistory(funds.data || [])
    setLoading(false)
  }

  const handleSaveUsername = async () => {
    if (!newUsername.trim() || newUsername.trim().length < 2) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ username: newUsername.trim() }).eq('id', user.id)
    if (!error && refreshProfile) await refreshProfile()
    setEditingUsername(false)
    setSaving(false)
  }

  const handleFundSuccess = async () => {
    setFundModal(null)
    await fetchData()
  }

  if (!user) return null

  const totalWalletBalance = agents.reduce((s, a) => s + parseFloat(a.wallet || 0), 0)
  const totalEarned = agents.reduce((s, a) => s + parseFloat(a.total_earned || 0), 0)
  const totalWon = agents.reduce((s, a) => s + (a.tasks_completed || 0), 0)
  const totalLost = agents.reduce((s, a) => s + (a.tasks_failed || 0), 0)
  const best = agents.length > 0 ? [...agents].sort((a, b) => parseFloat(b.price) - parseFloat(a.price))[0] : null
  const displayName = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || ''
  const totalUsdcValue = ((totalEarned / 100) * 5).toFixed(4)

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

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {/* Total Wallet Balance */}
        <div className="card stat-card">
          <div className="stat-icon"><Wallet size={16} /></div>
          <div className="stat-label">Total Wallet Balance</div>
          <div className="stat-number" style={{ fontSize: '0.95rem' }}>${totalWalletBalance.toFixed(2)}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>across {agents.length} agent{agents.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Total Earned with withdraw */}
        <div className="card stat-card">
          <div className="stat-icon"><TrendingUp size={16} /></div>
          <div className="stat-label">Total Earned</div>
          <div className="stat-number" style={{ fontSize: '0.95rem' }}>${totalEarned.toFixed(2)}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text3)', marginBottom: 6 }}>≈ {totalUsdcValue} USDC real</div>
          {totalEarned >= 1 && (
            <button
              className="btn btn-primary"
              onClick={() => setShowWithdrawAll(true)}
              style={{ padding: '4px 10px', fontSize: '0.62rem', width: '100%' }}
            >
              <Gift size={10} /> Withdraw
            </button>
          )}
        </div>

        {/* Best Agent */}
        <div className="card stat-card">
          <div className="stat-icon"><Trophy size={16} /></div>
          <div className="stat-label">Best Agent</div>
          <div className="stat-number" style={{ fontSize: '0.95rem' }}>{best ? `$${best.ticker}` : '—'}</div>
          {best && <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>${parseFloat(best.price).toFixed(4)}</div>}
        </div>

        {/* Tasks */}
        <div className="card stat-card">
          <div className="stat-icon"><Zap size={16} /></div>
          <div className="stat-label">Tasks W/L</div>
          <div className="stat-number" style={{ fontSize: '0.95rem' }}>{totalWon}/{totalLost}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>
            {totalWon + totalLost > 0 ? `${Math.round((totalWon / (totalWon + totalLost)) * 100)}% win rate` : 'no tasks yet'}
          </div>
        </div>
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
              const isExpanded = expandedAgent === a.ticker
              const holdings = a.shares_owned ? Object.entries(a.shares_owned) : []

              return (
                <div key={a.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Agent Row */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', cursor: 'pointer' }}
                    onClick={() => setExpandedAgent(isExpanded ? null : a.ticker)}
                  >
                    <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="md" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                        {a.full_name} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>${a.ticker}</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{a.style}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--green)' }}>${parseFloat(a.price).toFixed(4)}</div>
                      <span className={`badge ${sb.cls}`} style={{ fontSize: '0.55rem' }}>{sb.label}</span>
                    </div>
                    <div style={{ color: 'var(--text3)', marginLeft: 4 }}>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {/* Expanded Panel */}
                  {isExpanded && (
                    <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 14, marginBottom: 10 }}>

                      {/* Wallet + Stats Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text3)', marginBottom: 2 }}>Wallet</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--green)' }}>${parseFloat(a.wallet || 0).toFixed(2)}</div>
                        </div>
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text3)', marginBottom: 2 }}>Total Earned</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f0a500' }}>${parseFloat(a.total_earned || 0).toFixed(2)}</div>
                        </div>
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text3)', marginBottom: 2 }}>Tasks W/L</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                            <span style={{ color: 'var(--green)' }}>{a.tasks_completed || 0}</span>
                            <span style={{ color: 'var(--text3)' }}>/</span>
                            <span style={{ color: '#ff4444' }}>{a.tasks_failed || 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Holdings */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', marginBottom: 6 }}>HOLDINGS</div>
                        {holdings.length === 0 ? (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>No shares held</div>
                        ) : (
                          holdings.map(([ticker, data]) => (
                            <div key={ticker} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>${ticker}</span>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{data.shares} shares @ ${parseFloat(data.avg_buy_price).toFixed(4)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Fund Buttons */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => setFundModal({ agent: a, type: 'add' })}
                          style={{ flex: 1, padding: '7px', fontSize: '0.65rem', gap: 4 }}
                        >
                          Add Fund
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={() => setFundModal({ agent: a, type: 'remove' })}
                          style={{
                            flex: 1, padding: '7px', fontSize: '0.65rem', gap: 4, borderColor: '#ff4444', color: '#ff4444',
                            opacity: (!['active', 'dominant'].includes(a.status) || parseFloat(a.wallet || 0) < 1) ? 0.4 : 1
                          }}
                          disabled={!['active', 'dominant'].includes(a.status) || parseFloat(a.wallet || 0) < 1}
                        > Remove Fund
                        </button>

                        {parseFloat(a.total_earned || 0) >= 1 && (
                          <button
                            className="btn btn-outline"
                            onClick={() => setFundModal({ agent: a, type: 'reward' })}
                            style={{ flex: 1, padding: '7px', fontSize: '0.65rem', gap: 4, borderColor: '#f0a500', color: '#f0a500' }}
                          >
                            <Gift size={11} /> Rewards
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Fund History */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Fund History</div>
              <Wallet size={14} color="var(--text3)" />
            </div>
            {fundHistory.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: '0.72rem' }}>No fund transactions yet</div>
            )}
            {fundHistory.map((f, i) => {
              const cfg = {
                add: { label: 'Added', color: 'var(--green)', icon: '💰', sign: '+' },
                remove: { label: 'Removed', color: '#ff4444', icon: '💸', sign: '-' },
                reward_withdraw: { label: 'Reward', color: '#f0a500', icon: '🏆', sign: '-' },
              }[f.type] || { label: f.type, color: 'var(--text3)', icon: '•', sign: '' }
              return (
                <div key={f.id || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.72rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{cfg.icon}</span>
                      <span style={{ fontWeight: 700 }}>${f.agent_ticker}</span>
                      <span className="badge badge-gray" style={{ fontSize: '0.55rem' }}>{cfg.label}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: cfg.color }}>{cfg.sign}${parseFloat(f.amount).toFixed(2)}</span>
                      {f.usdc_amount && <span style={{ fontSize: '0.6rem', color: 'var(--text3)', marginLeft: 4 }}>({f.usdc_amount} USDC)</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {f.tx_hash
                      ? <a href={`https://basescan.org/tx/${f.tx_hash}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'var(--green)' }}>
                        {f.tx_hash.slice(0, 10)}...{f.tx_hash.slice(-6)}
                      </a>
                      : <span />
                    }
                    <span style={{ color: 'var(--text3)', fontSize: '0.62rem' }}>{timeAgo(f.created_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>

      {/* Activity Timeline — full width */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">Activity Timeline</div>
          <Clock size={14} color="var(--text3)" />
        </div>
        {activity.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: '0.72rem' }}>No activity yet</div>
        )}
        {activity.slice(0, activityPage * 10).map((ev, i) => (
          <div key={ev.id || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.72rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontWeight: 600 }}>${ev.agent_ticker}</span>
              <span style={{ color: 'var(--text3)', fontSize: '0.62rem' }}>{timeAgo(ev.created_at)}</span>
            </div>
            <div style={{ color: 'var(--text2)' }}>{ev.action}

            </div>
          </div>
       ))}
       {activity.length > activityPage * 10 && (
         <button
           onClick={() => setActivityPage(p => p + 1)}
           style={{ width: '100%', padding: '8px', marginTop: 8, fontSize: '0.72rem', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', cursor: 'pointer' }}
         >
           Load More
         </button>
       )}
     </div>

     {/* Fund Modal */}
      {fundModal && (
        <FundModal
          agent={fundModal.agent}
          type={fundModal.type}
          onClose={() => setFundModal(null)}
          onSuccess={handleFundSuccess}
          userId={user.id}
        />
      )}

      {/* Withdraw All Rewards Modal */}
      {showWithdrawAll && (
        <WithdrawAllModal
          agents={agents.filter(a => parseFloat(a.total_earned || 0) >= 1)}
          onClose={() => { setShowWithdrawAll(false); fetchData() }}
          userId={user.id}
        />
      )}
    </div>
  )
}