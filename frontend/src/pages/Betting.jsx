import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useSwitchChain, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import { base } from 'wagmi/chains'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { socket } from '../lib/socket'
import AgentAvatar from '../components/AgentAvatar'
import {
  Dice5, Wallet, TrendingUp, Clock,
  AlertTriangle, Trophy, Skull, ArrowUp, ArrowDown,
  Loader, ExternalLink, Info, CheckCircle, XCircle
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL
const HOUSE_WALLET = '0x518E341C981D9C64E4c8292fF6C3E8F5055ba256'

const BET_TYPES = {
  stays_first_24h: {
    label:     'Stays #1 for 24h',
    icon:      Trophy,
    color:     '#f59e0b',
    duration:  '24h',
    rightDesc: 'Bet + same % as agent price gained',
    wrongDesc: 'Bet − same % as agent price dropped',
  },
  bankrupt_24h: {
    label:     'Goes bankrupt in 24h',
    icon:      Skull,
    color:     '#ef4444',
    duration:  '24h',
    rightDesc: 'Bet + % of price collapse (big reward)',
    wrongDesc: 'Bet − % agent price rose',
  },
  price_up_next: {
    label:     'Price up next cycle',
    icon:      ArrowUp,
    color:     '#22c55e',
    duration:  '~15 min',
    rightDesc: 'Bet + same % price went up',
    wrongDesc: 'Bet − same % price went down',
  },
  price_down_next: {
    label:     'Price down next cycle',
    icon:      ArrowDown,
    color:     '#ef4444',
    duration:  '~15 min',
    rightDesc: 'Bet + same % price went down',
    wrongDesc: 'Bet − same % price went up',
  },
}

function formatTimeLeft(expiresAt) {
  const ms = new Date(expiresAt) - Date.now()
  if (ms <= 0) return 'Resolving...'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m left`
  if (m > 0) return `${m}m ${s}s left`
  return `${s}s left`
}

export default function Betting() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [agents, setAgents]                 = useState([])
  const [myBets, setMyBets]                 = useState([])
  const [pool, setPool]                     = useState({})
  const [selectedAgent, setSelectedAgent]   = useState(null)
  const [selectedBetType, setSelectedBetType] = useState(null)
  const [betAmount, setBetAmount]           = useState('')
  const [placing, setPlacing]               = useState(false)
  const [txStatus, setTxStatus]             = useState(null)
  const [error, setError]                   = useState('')
  const [success, setSuccess]               = useState('')
  const [tab, setTab]                       = useState('bet')
  const [txHash, setTxHash]                 = useState(undefined)
  const [confirmedTxHash, setConfirmedTxHash] = useState(null)
  const [countdown, setCountdown]           = useState({})

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } =
    useWaitForTransactionReceipt({ hash: txHash })

  // Cleanup on unmount
  useEffect(() => {
    return () => { setPlacing(false); setTxStatus(null) }
  }, [])

  // ── Fetchers ──────────────────────────────────────────────────────────────
  const fetchAgents = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/agents`)
      setAgents((data || []).filter(a => ['active', 'dominant'].includes(a.status)))
    } catch {}
  }, [])

  const fetchMyBets = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await axios.get(`${API}/api/bets/user/${user.id}`)
      setMyBets(data || [])
    } catch {}
  }, [user])

  const fetchPool = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/bets/pool`)
      setPool(data || {})
    } catch {}
  }, [])

  useEffect(() => {
    fetchAgents(); fetchPool()
    const iv = setInterval(() => { fetchAgents(); fetchPool() }, 30000)
    return () => clearInterval(iv)
  }, [fetchAgents, fetchPool])

  useEffect(() => { fetchMyBets() }, [fetchMyBets])

  // Socket
  useEffect(() => {
    const onBetPlaced   = () => { fetchPool(); fetchMyBets() }
    const onBetResolved = () => { fetchPool(); fetchMyBets() }
    socket.on('bet-placed', onBetPlaced)
    socket.on('bet-resolved', onBetResolved)
    return () => {
      socket.off('bet-placed', onBetPlaced)
      socket.off('bet-resolved', onBetResolved)
    }
  }, [fetchPool, fetchMyBets])

  // Wallet linking
  useEffect(() => {
    if (!isConnected || !address || !user) return
    supabase.from('user_wallets').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data && data.wallet_address === address) return
        if (data) {
          supabase.from('user_wallets')
            .update({ wallet_address: address, connected_at: new Date().toISOString() })
            .eq('user_id', user.id).then(() => {})
        } else {
          supabase.from('user_wallets').insert({
            user_id: user.id, wallet_address: address,
            total_bets: 0, total_won: 0, total_lost: 0,
            connected_at: new Date().toISOString()
          }).then(() => {})
        }
      })
  }, [isConnected, address, user])

  // Countdown ticker for active bets
  useEffect(() => {
    const tick = setInterval(() => {
      const updated = {}
      myBets.filter(b => b.status === 'active').forEach(b => {
        updated[b.id] = formatTimeLeft(b.expires_at)
      })
      setCountdown(updated)
    }, 1000)
    return () => clearInterval(tick)
  }, [myBets])

  // Record bet after TX confirmed
  useEffect(() => {
    if (!isConfirmed || !receipt || !placing) return
    async function recordBet() {
      try {
        setTxStatus('Recording bet...')
        const res = await axios.post(`${API}/api/bets/place`, {
          userWallet:  address,
          userId:      user.id,
          agentTicker: selectedAgent.ticker,
          betType:     selectedBetType,
          betAmount:   parseFloat(betAmount),
          txHash:      receipt.transactionHash,
        })
        setConfirmedTxHash(receipt.transactionHash)
        const bt = BET_TYPES[selectedBetType]
        setSuccess(
          `✅ Bet placed on ${selectedAgent.ticker}! Price locked at $${parseFloat(res.data.priceAtBet).toFixed(4)}. ` +
          `Resolves in ${bt.duration}. If right: ${bt.rightDesc}.`
        )
        setPlacing(false); setTxStatus(null); setTxHash(undefined)
        setSelectedAgent(null); setSelectedBetType(null); setBetAmount('')
        fetchMyBets(); fetchPool()
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to record bet')
        setPlacing(false); setTxStatus(null); setTxHash(undefined)
      }
    }
    recordBet()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, receipt, placing])

  // Place bet
  const handlePlaceBet = async () => {
    setError(''); setSuccess(''); setConfirmedTxHash(null)
    if (!selectedAgent || !selectedBetType) { setError('Select an agent and bet type'); return }
    const amount = parseFloat(betAmount)
    if (!amount || amount < 0.001 || amount > 0.1) {
      setError('Bet must be between 0.001 and 0.1 ETH'); return
    }
    if (chainId !== base.id) { setError('Please switch to Base network'); return }

    setPlacing(true)
    setTxStatus('Sending ETH to house wallet...')
    try {
      const hash = await sendTransactionAsync({
        to:    HOUSE_WALLET,
        value: parseEther(amount.toString()),
      })
      setTxHash(hash)
      setTxStatus('Waiting for confirmation...')
    } catch (err) {
      const msg = err?.message || ''
      const isRejection =
        msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('cancelled') || err?.code === 4001
      setError(isRejection ? 'Transaction cancelled' : (msg || 'Transaction failed'))
      setPlacing(false); setTxStatus(null)
    }
  }

  const isOnBase = chainId === base.id
  const activeBetsCount = myBets.filter(b => b.status === 'active').length

  // Auth gate
  if (!user) {
    return (
      <div className="betting-page">
        <div className="betting-auth-gate">
          <Dice5 size={48} />
          <h2>Agent Betting</h2>
          <p>Bet ETH on agent outcomes. Payouts mirror the real % price move — no fixed odds.</p>
          <button className="btn-primary" onClick={() => navigate('/login')}>Login to Start Betting</button>
          <button className="btn-secondary" onClick={() => navigate('/signup')}>Create Account</button>
        </div>
      </div>
    )
  }

  return (
    <div className="betting-page">

      {/* Header */}
      <div className="betting-header">
        <div className="betting-header-left">
          <Dice5 size={24} />
          <h1>Agent Betting</h1>
          <span className="betting-badge">Base Network</span>
          <span className="betting-badge betting-badge-eth">ETH</span>
        </div>
        <div className="betting-header-right">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>

      {/* How it works */}
      <div style={{
        background: '#0d1f2d', border: '1px solid #1e3a4a', borderRadius: 10,
        padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start'
      }}>
        <Info size={16} style={{ color: '#38bdf8', marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.7 }}>
          <strong style={{ color: '#e2e8f0' }}>How payouts work — no fixed odds, real % moves:</strong>
          <span style={{ display: 'block', marginTop: 4 }}>
            Your payout is calculated from the actual % price change of the agent at resolution.{' '}
            <span style={{ color: '#4ade80' }}>Correct prediction → get your bet back + that same % as profit.</span>{' '}
            <span style={{ color: '#fca5a5' }}>Wrong prediction → get your bet back minus that same % as loss.</span>{' '}
            You can never lose more than your original bet.
          </span>
        </div>
      </div>

      {/* Not connected */}
      {!isConnected && (
        <div className="betting-connect-card">
          <Wallet size={32} />
          <h3>Connect Your Wallet</h3>
          <p>Connect an EVM wallet on Base network to place bets</p>
          <ConnectButton />
        </div>
      )}

      {/* Wrong network */}
      {isConnected && !isOnBase && (
        <div className="betting-connect-card betting-wrong-network">
          <AlertTriangle size={32} />
          <h3>Wrong Network</h3>
          <p>Please switch to Base network to place bets</p>
          <button className="btn-primary" onClick={() => switchChain({ chainId: base.id })}>
            Switch to Base
          </button>
        </div>
      )}

      {isConnected && isOnBase && (
        <>
          {/* Tabs */}
          <div className="betting-tabs">
            <button className={`betting-tab ${tab === 'bet' ? 'active' : ''}`} onClick={() => setTab('bet')}>
              Place Bet
            </button>
            <button
              className={`betting-tab ${tab === 'my' ? 'active' : ''}`}
              onClick={() => { setTab('my'); fetchMyBets() }}
            >
              My Bets
              {activeBetsCount > 0 && <span className="betting-tab-count">{activeBetsCount}</span>}
            </button>
            <button
              className={`betting-tab ${tab === 'pool' ? 'active' : ''}`}
              onClick={() => { setTab('pool'); fetchPool() }}
            >
              Live Pool
            </button>
          </div>

          {error   && <div className="betting-alert betting-alert-error">{error}</div>}
          {success && (
            <div className="betting-alert betting-alert-success">
              {success}
              {confirmedTxHash && (
                <a href={`https://basescan.org/tx/${confirmedTxHash}`} target="_blank"
                  rel="noopener noreferrer" className="betting-bet-tx" style={{ marginLeft: 8 }}>
                  View on BaseScan <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}

          {/* ════ PLACE BET TAB ════ */}
          {tab === 'bet' && (
            <div className="betting-layout">

              {/* Agent grid */}
              <div className="betting-agents-grid">
                {agents.length === 0 && (
                  <div className="betting-empty">
                    <TrendingUp size={32} /><p>No active agents right now</p>
                  </div>
                )}
                {agents.map(agent => {
                  const isSelected   = selectedAgent?.ticker === agent.ticker
                  const currentPrice = parseFloat(agent.price)
                  const pct          = (((currentPrice - 1.0) / 1.0) * 100).toFixed(1)
                  const agentPool    = pool[agent.ticker]

                  return (
                    <div
                      key={agent.ticker}
                      className={`betting-agent-card ${isSelected ? 'betting-agent-card--selected' : ''}`}
                      onClick={() => { setSelectedAgent(isSelected ? null : agent); setSelectedBetType(null) }}
                    >
                      <div className="betting-agent-top">
                        <AgentAvatar ticker={agent.ticker} avatarUrl={agent.avatar_url} size="md" />
                        <div className="betting-agent-info">
                          <span className="betting-agent-ticker">{agent.ticker}</span>
                          <span className="betting-agent-name">{agent.full_name}</span>
                        </div>
                        <div className="betting-agent-price">
                          <span className="betting-agent-price-val">${currentPrice.toFixed(4)}</span>
                          <span className={`betting-agent-pct ${parseFloat(pct) >= 0 ? 'green' : 'red'}`}>
                            {parseFloat(pct) >= 0 ? '+' : ''}{pct}%
                          </span>
                        </div>
                      </div>

                      {agentPool && (
                        <div className="betting-agent-pool">
                          <span>{agentPool.total_eth.toFixed(4)} ETH pooled</span>
                          <span>{agentPool.total_bets} active bet{agentPool.total_bets !== 1 ? 's' : ''}</span>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          <span style={{ color: '#64748b' }}>Win Rate </span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                            {agent.tasks_completed + agent.tasks_failed > 0
                              ? ((agent.tasks_completed / (agent.tasks_completed + agent.tasks_failed)) * 100).toFixed(1)
                              : '0.0'}%
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          <span style={{ color: '#64748b' }}>Wallet </span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>${parseFloat(agent.wallet).toFixed(2)}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          <span style={{ color: '#64748b' }}>Earned </span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>${parseFloat(agent.total_earned).toFixed(2)}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          <span style={{ color: '#22c55e' }}>▲ {agent.tasks_completed}W </span>
                          <span style={{ color: '#ef4444' }}>▼ {agent.tasks_failed}L</span>
                        </div>
                        <div style={{ fontSize: '0.75rem' }}>
                          <span style={{ color: parseFloat(pct) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                            {parseFloat(pct) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(pct)).toFixed(2)}% since launch
                          </span>
                        </div>
                      </div>

                      {/* Bet type buttons — only show when agent is selected */}
                      {isSelected && (
                        <div className="betting-types-grid">
                          {Object.entries(BET_TYPES).map(([key, bt]) => {
                            const Icon     = bt.icon
                            const isActive = selectedBetType === key
                            return (
                              <button
                                key={key}
                                className={`betting-type-btn ${isActive ? 'betting-type-btn--active' : ''}`}
                                onClick={e => { e.stopPropagation(); setSelectedBetType(key) }}
                              >
                                <Icon size={13} style={{ color: bt.color, flexShrink: 0 }} />
                                <span className="betting-type-label">
                                  {bt.label}
                                  <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748b', fontWeight: 400 }}>
                                    {bt.duration}
                                  </span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Payout explanation for selected bet type */}
                      {isSelected && selectedBetType && (
                        <div style={{
                          marginTop: 8, padding: '8px 10px',
                          background: '#071219', borderRadius: 6, fontSize: '0.75rem'
                        }}>
                          <div style={{ color: '#4ade80', marginBottom: 3 }}>
                            ✅ If right: {BET_TYPES[selectedBetType].rightDesc}
                          </div>
                          <div style={{ color: '#f87171' }}>
                            ❌ If wrong: {BET_TYPES[selectedBetType].wrongDesc}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Bet slip */}
              {selectedAgent && selectedBetType && (
                <div className="betting-slip">
                  <h3>Bet Slip</h3>

                  <div className="betting-slip-summary">
                    <div className="betting-slip-row">
                      <span>Agent</span>
                      <span className="betting-slip-val">{selectedAgent.ticker}</span>
                    </div>
                    <div className="betting-slip-row">
                      <span>Bet type</span>
                      <span className="betting-slip-val">{BET_TYPES[selectedBetType].label}</span>
                    </div>
                    <div className="betting-slip-row">
                      <span>Resolves in</span>
                      <span className="betting-slip-val">{BET_TYPES[selectedBetType].duration}</span>
                    </div>
                    <div className="betting-slip-row">
                      <span>Current price</span>
                      <span className="betting-slip-val">${parseFloat(selectedAgent.price).toFixed(4)}</span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="betting-amount-input">
                    <label>Amount (ETH) — min 0.001 · max 0.1</label>
                    <div className="betting-amount-row">
                      <input
                        type="number" min="0.001" max="0.1" step="0.001"
                        value={betAmount}
                        onChange={e => setBetAmount(e.target.value)}
                        placeholder="0.001 – 0.1"
                      />
                      <div className="betting-quick-amounts">
                        {[0.001, 0.005, 0.01, 0.05, 0.1].map(v => (
                          <button key={v} onClick={() => setBetAmount(v.toString())} className="betting-quick-btn">
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Payout preview scenarios */}
                  {betAmount && parseFloat(betAmount) >= 0.001 && (() => {
                    const amt = parseFloat(betAmount)
                    const scenarios = selectedBetType === 'bankrupt_24h'
                      ? [
                          { pct: 95, label: 'Bankrupt (−95%)', right: true  },
                          { pct: 50, label: 'Bankrupt (−50%)', right: true  },
                          { pct: 10, label: 'Price +10%',       right: false },
                          { pct: 25, label: 'Price +25%',       right: false },
                        ]
                      : selectedBetType === 'price_up_next'
                      ? [
                          { pct: 15, label: 'Price +15%', right: true  },
                          { pct: 5,  label: 'Price +5%',  right: true  },
                          { pct: 5,  label: 'Price −5%',  right: false },
                          { pct: 15, label: 'Price −15%', right: false },
                        ]
                      : selectedBetType === 'price_down_next'
                      ? [
                          { pct: 15, label: 'Price −15%', right: true  },
                          { pct: 5,  label: 'Price −5%',  right: true  },
                          { pct: 5,  label: 'Price +5%',  right: false },
                          { pct: 15, label: 'Price +15%', right: false },
                        ]
                      : [ // stays_first_24h
                          { pct: 20, label: 'Stays #1 +20%', right: true  },
                          { pct: 5,  label: 'Stays #1 +5%',  right: true  },
                          { pct: 10, label: 'Loses #1 −10%', right: false },
                          { pct: 5,  label: 'Loses #1 −5%',  right: false },
                        ]

                    return (
                      <div style={{
                        background: '#0a1628', border: '1px solid #1e2d3d',
                        borderRadius: 8, padding: 12, marginBottom: 14
                      }}>
                        <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>
                          Example Payouts
                        </div>
                        {scenarios.map((s, i) => {
                          const payout = s.right
                            ? (amt + amt * (s.pct / 100)).toFixed(4)
                            : Math.max(0, amt - amt * (s.pct / 100)).toFixed(4)
                          return (
                            <div key={i} style={{
                              display: 'flex', justifyContent: 'space-between',
                              fontSize: '0.77rem', padding: '3px 0',
                              borderBottom: i < scenarios.length - 1 ? '1px solid #1e2d3d' : 'none'
                            }}>
                              <span style={{ color: s.right ? '#4ade80' : '#f87171' }}>
                                {s.right ? '✅' : '❌'} {s.label}
                              </span>
                              <span style={{ fontWeight: 700, color: s.right ? '#4ade80' : '#f87171' }}>
                                → {payout} ETH
                              </span>
                            </div>
                          )
                        })}
                        <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: 6 }}>
                          * Actual payout = real % change at expiry. Examples are illustrative.
                        </div>
                      </div>
                    )
                  })()}

                  <button
                    className="btn-place-bet"
                    onClick={handlePlaceBet}
                    disabled={placing || isSending || isConfirming || !betAmount || parseFloat(betAmount) < 0.001}
                  >
                    {placing || isSending || isConfirming
                      ? <><Loader size={16} className="spin" /> {txStatus || 'Processing...'}</>
                      : `Place Bet — ${betAmount || '0'} ETH`
                    }
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════ MY BETS TAB ════ */}
          {tab === 'my' && (
            <div className="betting-my-bets">
              {myBets.length === 0 ? (
                <div className="betting-empty">
                  <Dice5 size={32} /><p>No bets yet. Place your first bet!</p>
                </div>
              ) : (
                <div className="betting-bets-list">
                  {myBets.map(bet => {
                    const bt           = BET_TYPES[bet.bet_type]
                    const payout       = parseFloat(bet.potential_payout || 0)
                    const betAmt       = parseFloat(bet.bet_amount || 0)
                    const profitOrLoss = parseFloat((payout - betAmt).toFixed(6))
                    const priceAtBet   = parseFloat(bet.agent_price_at_bet || 0)

                    return (
                      <div key={bet.id} className={`betting-bet-card betting-bet-${bet.status}`}>
                        <div className="betting-bet-top">
                          <span className="betting-bet-ticker">{bet.agent_ticker}</span>
                          <span className={`betting-bet-status betting-bet-status--${bet.status}`}>
                            {bet.status === 'won'  && <CheckCircle size={10} style={{ marginRight: 3 }} />}
                            {bet.status === 'lost' && <XCircle     size={10} style={{ marginRight: 3 }} />}
                            {bet.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="betting-bet-type">{bt?.label || bet.bet_type}</div>

                        <div className="betting-bet-details">
                          <div className="betting-bet-detail">
                            <span>Bet</span>
                            <span>{betAmt.toFixed(4)} ETH</span>
                          </div>
                          <div className="betting-bet-detail">
                            <span>Price at bet</span>
                            <span>${priceAtBet.toFixed(4)}</span>
                          </div>
                          <div className="betting-bet-detail">
                            <span>Current price</span>
                            <span>${parseFloat(agents.find(a => a.ticker === bet.agent_ticker)?.price || 0).toFixed(4)}</span>
                          </div>

                          {bet.status === 'active' && (
                            <div className="betting-bet-detail">
                              <Clock size={12} />
                              <span>{countdown[bet.id] || formatTimeLeft(bet.expires_at)}</span>
                            </div>
                          )}

                          {(bet.status === 'won' || bet.status === 'lost') && (
                            <>
                              <div className="betting-bet-detail">
                                <span>Returned</span>
                                <span style={{ color: profitOrLoss >= 0 ? '#22c55e' : '#f87171' }}>
                                  {payout.toFixed(4)} ETH
                                </span>
                              </div>
                              <div className="betting-bet-detail">
                                <span>P&amp;L</span>
                                <span style={{ color: profitOrLoss >= 0 ? '#22c55e' : '#f87171', fontWeight: 700 }}>
                                  {profitOrLoss >= 0 ? '+' : ''}{profitOrLoss.toFixed(4)} ETH
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          {bet.tx_hash && (
                            <a href={`https://basescan.org/tx/${bet.tx_hash}`} target="_blank"
                              rel="noopener noreferrer" className="betting-bet-tx">
                              Bet TX <ExternalLink size={10} />
                            </a>
                          )}
                          {bet.payout_tx_hash && (
                            <a href={`https://basescan.org/tx/${bet.payout_tx_hash}`} target="_blank"
                              rel="noopener noreferrer" className="betting-bet-tx" style={{ color: '#22c55e' }}>
                              Payout TX <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════ LIVE POOL TAB ════ */}
          {tab === 'pool' && (
            <div className="betting-pool">
              {Object.keys(pool).length === 0 ? (
                <div className="betting-empty">
                  <TrendingUp size={32} /><p>No active bets in the pool yet</p>
                </div>
              ) : (
                <div className="betting-pool-grid">
                  {Object.entries(pool)
                    .sort((a, b) => b[1].total_eth - a[1].total_eth)
                    .map(([ticker, data]) => {
                      const agent = agents.find(a => a.ticker === ticker)
                      return (
                        <div key={ticker} className="betting-pool-card">
                          <div className="betting-pool-agent">
                            <AgentAvatar ticker={ticker} avatarUrl={agent?.avatar_url} size="sm" />
                            <span className="betting-pool-ticker">{ticker}</span>
                            <span className="betting-pool-total">{data.total_eth.toFixed(4)} ETH</span>
                            <span className="betting-pool-count">
                              {data.total_bets} bet{data.total_bets !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="betting-pool-types">
                            {Object.entries(data.by_type)
                              .filter(([, td]) => td.count > 0)
                              .map(([type, td]) => (
                                <div key={type} className="betting-pool-type-row">
                                  <span>{BET_TYPES[type]?.label || type}</span>
                                  <span>{td.eth.toFixed(4)} ETH ({td.count})</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}