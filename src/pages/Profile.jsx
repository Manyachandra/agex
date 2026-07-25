import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { User, Clock, UserPlus, Edit2, Save, Loader, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Wallet, ExternalLink, Copy } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { useAccount, useChainId, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import { robinhood, explorerTx, explorerAddress, explorerToken } from '../lib/chains'

import { asArray } from '../lib/api'
import { API_BASE as API } from '../lib/config'

const MIN_ETH = 0.0001
function timeAgo(d) {
  if (!d) return ''
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(d).toLocaleDateString()
}

function sanitizeActivityAction(action) {
  if (!action) return ''
  return String(action)
    .replace(/\s*—\s*earned\s*\$[\d.]+/gi, '')
    .replace(/\s*—\s*lost\s*\$[\d.]+/gi, '')
    .replace(/,\s*earned\s*\$[\d.]+/gi, '')
    .replace(/🏆\s*Reward withdrawn[^.]*\.?/gi, 'Funds update')
    .replace(/\bearned\s*\$[\d.]+\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
// ── Fund Modal (add ETH to agent wallet) ──────────────────────────────────────
function FundModal({ agent, onClose, onSuccess, userId }) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const isOnChain = chainId === robinhood.id

  const [amount, setAmount] = useState('')
  const [txStatus, setTxStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successData, setSuccessData] = useState(null)
  const [pendingTxHash, setPendingTxHash] = useState(undefined)

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } =
    useWaitForTransactionReceipt({ hash: pendingTxHash })

  useEffect(() => {
    if (!isConfirmed || !receipt || !loading) return
    async function recordAdd() {
      try {
        setTxStatus('Recording transaction...')
        const res = await axios.post(`${API}/api/funds/add`, {
          agentTicker: agent.ticker,
          userWallet: address,
          userId,
          amount: parseFloat(amount),
          txHash: receipt.transactionHash,
          asset: 'ETH',
        })
        if (res.data.success) {
          setSuccessData({ amount: parseFloat(amount), txHash: receipt.transactionHash })
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
    if (!parsed || parsed < MIN_ETH) { setError(`Minimum ${MIN_ETH} ETH`); return }
    if (!agent.wallet_address) { setError('This agent has no on-chain wallet'); return }
    if (!isConnected) { setError('Please connect your wallet'); return }
    if (!isOnChain) { setError('Please switch to Robinhood Chain'); return }

    setLoading(true)
    setTxStatus('Sending ETH to agent wallet...')
    try {
      const hash = await sendTransactionAsync({
        to: agent.wallet_address,
        value: parseEther(String(parsed)),
      })
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

  const isProcessing = loading || isSending || isConfirming

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div className="lane lane--ticket" style={{ width: '100%', maxWidth: 420, margin: 0 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="lane-title" style={{ fontSize: '0.85rem', letterSpacing: '0.6px' }}>Add Funds</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '1.2rem' }}>✕</button>
        </div>

        {successData ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>Funds Added!</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 10 }}>
              {successData.amount} ETH sent to agent wallet
            </div>
            {successData.txHash && (
              <a href={explorerTx(successData.txHash)} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '0.65rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                View on Explorer <ExternalLink size={10} />
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
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Use the wallet button in the dock to connect</div>
          </div>

        ) : (
          <>
            <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>${agent.ticker}</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>Wallet Balance</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--green)' }}>
                  ${parseFloat(agent.wallet || 0).toFixed(2)}
                </div>
              </div>
            </div>

            {!isOnChain && (
              <div style={{ background: 'rgba(255,100,0,0.1)', border: '1px solid rgba(255,100,0,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.72rem', color: '#ff8844' }}>
                ⚠️ Please switch to Robinhood Chain to send ETH
              </div>
            )}

            <div style={{ background: 'rgba(0,200,100,0.08)', border: '1px solid rgba(0,200,100,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.72rem' }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>ETH will be sent to your agent's wallet</div>
              <div style={{ color: 'var(--text3)', wordBreak: 'break-all' }}>Network: Robinhood Chain • Asset: ETH • Min: {MIN_ETH} ETH</div>
              {agent.wallet_address && (
                <div style={{ color: 'var(--text3)', marginTop: 4 }}>
                  To: <code style={{ color: 'var(--text2)' }}>{agent.wallet_address.slice(0, 10)}...{agent.wallet_address.slice(-6)}</code>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
                Amount (ETH) — min {MIN_ETH}
              </label>
              <input
                className="register-input"
                type="number" min={MIN_ETH} step="0.0001"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter ETH amount"
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
              />
            </div>

            {txStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'var(--text3)', marginBottom: 10 }}>
                <Loader size={12} className="auth-spinner" /> {txStatus}
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: '0.72rem', color: '#ff5555', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" onClick={onClose} style={{ flex: 1, padding: '9px', fontSize: '0.78rem' }} disabled={isProcessing}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAdd}
                disabled={isProcessing || !amount || parseFloat(amount) < MIN_ETH}
                style={{ flex: 1, padding: '9px', fontSize: '0.78rem', background: 'var(--green)' }}
              >
                {isProcessing
                  ? <><Loader size={13} className="auth-spinner" /> Processing...</>
                  : 'Add Funds'
                }
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
  const { user, profile, refreshProfile, connectWallet } = useAuth()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedAgent, setExpandedAgent] = useState(null)
  const [fundModal, setFundModal] = useState(null) // { agent }
  const [activityPage, setActivityPage] = useState(1)
  const [fundHistory, setFundHistory] = useState([])
  const [tradeCount, setTradeCount] = useState(0)
  const [walletBalances, setWalletBalances] = useState({}) // { [ticker]: { address, eth, token, tokenSymbol, loading } }

  useEffect(() => {
    if (!user) return
    fetchData()
  }, [user])

  // Lazily fetch an agent's real on-chain wallet balance when its panel opens.
  useEffect(() => {
    if (!expandedAgent) return
    if (walletBalances[expandedAgent]) return
    setWalletBalances(prev => ({ ...prev, [expandedAgent]: { loading: true } }))
    axios.get(`${API}/api/agents/${expandedAgent}/wallet`)
      .then(r => setWalletBalances(prev => ({ ...prev, [expandedAgent]: { ...r.data, loading: false } })))
      .catch(() => setWalletBalances(prev => ({ ...prev, [expandedAgent]: { loading: false, error: true } })))
  }, [expandedAgent]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    const [a, act, funds, trades] = await Promise.all([
      axios.get(`${API}/api/agents/mine/${user.id}`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/activity`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/funds/history/user/${user.id}`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/token-trades?limit=5000`).catch(() => ({ data: [] })),
    ])
    const myAgents = asArray(a.data)
    setAgents(myAgents)
    const tickers = new Set(myAgents.map(ag => ag.ticker))
    const myActivity = asArray(act.data).filter(ev => tickers.has(ev.agent_ticker)).slice(0, 50)
    setActivity(myActivity)
    setFundHistory(asArray(funds.data))
    setTradeCount(asArray(trades.data).filter(t => tickers.has(t.agent_ticker)).length)
    setLoading(false)
  }

  const handleSaveUsername = async () => {
    if (!newUsername.trim() || newUsername.trim().length < 2) return
    setSaving(true)
    try {
      const res = await axios.patch(`${API}/api/user/profile/${user.id}`, {
        username: newUsername.trim(),
      })
      if (res.data && refreshProfile) await refreshProfile()
      setEditingUsername(false)
    } catch {
      // keep editor open on failure
    }
    setSaving(false)
  }

  const handleFundSuccess = async () => {
    setFundModal(null)
    await fetchData()
  }

  if (!user) {
    return (
      <div className="fade-in desk">
        <div className="terminal-bar">
          <div>
            <div className="terminal-bar-title">My Profile</div>
            <div className="terminal-bar-sub">Connect your wallet to view agents and funds</div>
          </div>
        </div>
        <div className="lane">
          <div className="lane-body" style={{ textAlign: 'center', padding: 40 }}>
            <Wallet size={28} style={{ color: 'var(--text3)', marginBottom: 12 }} />
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Wallet Required</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: 16 }}>
              Connect a wallet to manage your agents.
            </div>
            <button type="button" className="btn btn-primary" onClick={connectWallet} style={{ padding: '8px 20px' }}>
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalWalletBalance = agents.reduce((s, a) => s + parseFloat(a.wallet || 0), 0)
  const best = agents.length > 0 ? [...agents].sort((a, b) => parseFloat(b.price) - parseFloat(a.price))[0] : null
  const displayName = profile?.username || (user?.id ? `Trader ${user.id.slice(2, 6).toUpperCase()}` : '')
  const walletLabel = user?.id
    ? `${user.id.slice(0, 6)}…${user.id.slice(-4)}`
    : ''
  const ACTIVITY_PAGE_SIZE = 10
  const timelineActivity = activity.filter(ev => ev.action_type !== 'reward_withdraw' && ev.action_type !== 'task' && ev.action_type !== 'content')
  const activityTotalPages = Math.max(1, Math.ceil(timelineActivity.length / ACTIVITY_PAGE_SIZE))
  const activityPageClamped = Math.min(activityPage, activityTotalPages)
  const paginatedActivity = timelineActivity.slice(
    (activityPageClamped - 1) * ACTIVITY_PAGE_SIZE,
    activityPageClamped * ACTIVITY_PAGE_SIZE
  )

  return (
    <div className="fade-in desk">
      <div className="terminal-bar">
        <div>
          <div className="terminal-bar-title">My Profile</div>
          <div className="terminal-bar-sub">Account desk — agents, funds, and activity</div>
        </div>
      </div>

      {/* Profile Header */}
      <div className="lane">
        <div className="lane-head">
          <div className="lane-title">Identity</div>
        </div>
        <div className="lane-body" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingBottom: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--green)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Tinos', serif", fontWeight: 800, fontSize: '1.2rem', flexShrink: 0 }}>
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
                <span style={{ fontFamily: "'Tinos', serif", fontWeight: 800, fontSize: '1.2rem' }}>{displayName}</span>
                <button onClick={() => { setNewUsername(displayName); setEditingUsername(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
                  <Edit2 size={13} />
                </button>
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 2, fontFamily: "'Tinos', serif" }}>{walletLabel}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <span className="badge badge-gray">Joined {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="terminal-metrics">
        <div className="terminal-metric">
          <div className="terminal-metric-label">Wallet Balance</div>
          <div className="terminal-metric-value" style={{ color: '#18B368' }}>${totalWalletBalance.toFixed(2)}</div>
          <div className="terminal-metric-sub">across {agents.length} agent{agents.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="terminal-metric">
          <div className="terminal-metric-label">Agents</div>
          <div className="terminal-metric-value" style={{ color: '#5B6CFF' }}>{agents.length}</div>
          <div className="terminal-metric-sub">registered</div>
        </div>
        <div className="terminal-metric">
          <div className="terminal-metric-label">Best Agent</div>
          <div className="terminal-metric-value" style={{ color: '#FFB547' }}>{best ? `$${best.ticker}` : '—'}</div>
          {best && <div className="terminal-metric-sub">${parseFloat(best.price).toFixed(4)}</div>}
        </div>
        <div className="terminal-metric">
          <div className="terminal-metric-label">Trades</div>
          <div className="terminal-metric-value" style={{ color: '#FFB547' }}>{tradeCount}</div>
          <div className="terminal-metric-sub">by your agents</div>
        </div>
      </div>

      <div className="terminal-split" style={{ gap: 24 }}>
        {/* My Agents */}
        <div className="lane">
          <div className="lane-head">
            <div className="lane-title">My Agents</div>
            <span className="badge badge-green">{agents.length}</span>
          </div>
          <div className="lane-body">
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
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--green)' }}>${parseFloat(a.price).toFixed(4)}</div>
                    </div>
                    <div style={{ color: 'var(--text3)', marginLeft: 4 }}>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {/* Expanded Panel */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 0', marginBottom: 4 }}>

                      {/* Wallet */}
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', marginBottom: 14 }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text3)', marginBottom: 2 }}>Paper Wallet</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--green)' }}>${parseFloat(a.wallet || 0).toFixed(2)}</div>
                      </div>

                      {/* Real on-chain wallet */}
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)' }}>REAL ON-CHAIN WALLET (ROBINHOOD)</div>
                          {(walletBalances[a.ticker]?.address || a.wallet_address) && (
                            <a href={explorerAddress(walletBalances[a.ticker]?.address || a.wallet_address)}
                              target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '0.6rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              Explorer <ExternalLink size={9} />
                            </a>
                          )}
                        </div>

                        {(() => {
                          const wb = walletBalances[a.ticker]
                          const addr = wb?.address || a.wallet_address
                          if (!addr) {
                            return <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>No wallet linked to this agent yet.</div>
                          }
                          return (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <code style={{ flex: 1, fontSize: '0.62rem', color: 'var(--text2)', wordBreak: 'break-all' }}>
                                  {addr.slice(0, 10)}...{addr.slice(-8)}
                                </code>
                                <button onClick={() => { try { navigator.clipboard.writeText(addr) } catch { /* noop */ } }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }} title="Copy address">
                                  <Copy size={12} />
                                </button>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                                  <div style={{ fontSize: '0.55rem', color: 'var(--text3)' }}>ETH</div>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>
                                    {wb?.loading ? '…' : (wb?.eth ?? 0).toFixed(6)}
                                  </div>
                                </div>
                                <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                                  <div style={{ fontSize: '0.55rem', color: 'var(--text3)' }}>{wb?.tokenSymbol || 'AGEX'}</div>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--green)' }}>
                                    {wb?.loading ? '…' : (wb?.token ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                  </div>
                                </div>
                              </div>
                            </>
                          )
                        })()}
                      </div>

                      {/* Real token holdings (on-chain trending tokens) */}
                      {(() => {
                        const th = a.token_holdings || {}
                        const entries = Object.entries(th).filter(([, v]) => v && parseFloat(v.amount) > 0)
                        if (entries.length === 0) return null
                        return (
                          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>REAL TOKEN HOLDINGS (BASE)</div>
                            {entries.map(([addr, v]) => (
                              <div key={addr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                <a href={explorerToken(addr)} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--green)' }}>${v.symbol || '???'}</a>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.68rem', fontWeight: 700 }}>{parseFloat(v.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                                  <div style={{ fontSize: '0.58rem', color: 'var(--text3)' }}>{parseFloat(v.eth_in || 0).toFixed(6)} ETH in</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}

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

                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => setFundModal({ agent: a })}
                          style={{
                            width: 'auto',
                            padding: '4px 10px',
                            fontSize: '0.62rem',
                            gap: 4,
                            lineHeight: 1.2,
                          }}
                        >
                          + Add Fund
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Fund History */}
        <div className="lane">
          <div className="lane-head">
            <div className="lane-title">Fund History</div>
            <Wallet size={14} color="var(--text3)" />
          </div>
          <div className="lane-body stream">
            {fundHistory.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: '0.72rem' }}>No fund transactions yet</div>
            )}
            {fundHistory.map((f, i) => {
              if (f.type !== 'add') return null
              return (
                <div key={f.id || i} className="stream-item" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, fontSize: '0.72rem' }}>
                      <span>💰</span>
                      <span style={{ fontWeight: 700 }}>${f.agent_ticker}</span>
                      <span className="badge badge-gray" style={{ fontSize: '0.55rem' }}>Added</span>
                    </div>
                    {f.tx_hash
                      ? <a href={explorerTx(f.tx_hash)} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: "'Tinos', serif", fontSize: '0.6rem', color: 'var(--green)' }}>
                        {f.tx_hash.slice(0, 10)}...{f.tx_hash.slice(-6)}
                      </a>
                      : null
                    }
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.72rem' }}>
                      +{parseFloat(f.amount).toFixed(6)} ETH
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: '0.62rem' }}>{timeAgo(f.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Activity Timeline — full width */}
      <div className="lane">
        <div className="lane-head">
          <div className="lane-title">Activity Timeline</div>
          <Clock size={14} color="var(--text3)" />
        </div>
        <div className="lane-body stream">
          {timelineActivity.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: '0.72rem' }}>No activity yet</div>
          )}
          {paginatedActivity.map((ev, i) => (
            <div key={ev.id || i} className="stream-item" style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.72rem', marginBottom: 2 }}>${ev.agent_ticker}</div>
                <div style={{ color: 'var(--text2)', fontSize: '0.72rem' }}>{sanitizeActivityAction(ev.action)}</div>
              </div>
              <span style={{ color: 'var(--text3)', fontSize: '0.62rem' }}>{timeAgo(ev.created_at)}</span>
            </div>
          ))}
          {activityTotalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                disabled={activityPageClamped <= 1}
                className="desk-chip"
                style={{ opacity: activityPageClamped <= 1 ? 0.4 : 1, cursor: activityPageClamped <= 1 ? 'not-allowed' : 'pointer' }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Tinos', serif" }}>
                Page {activityPageClamped} of {activityTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setActivityPage(p => Math.min(activityTotalPages, p + 1))}
                disabled={activityPageClamped >= activityTotalPages}
                className="desk-chip"
                style={{ opacity: activityPageClamped >= activityTotalPages ? 0.4 : 1, cursor: activityPageClamped >= activityTotalPages ? 'not-allowed' : 'pointer' }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

     {/* Fund Modal */}
      {fundModal && (
        <FundModal
          agent={fundModal.agent}
          onClose={() => setFundModal(null)}
          onSuccess={handleFundSuccess}
          userId={user.id}
        />
      )}

    </div>
  )
}