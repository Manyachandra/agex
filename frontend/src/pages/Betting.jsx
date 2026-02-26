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
  Dice5, Wallet, TrendingUp, TrendingDown, Clock,
  AlertTriangle, Trophy, Skull, ArrowUp, ArrowDown, Loader, ExternalLink
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL
const HOUSE_WALLET = '0x518E341C981D9C64E4c8292fF6C3E8F5055ba256'

const BET_TYPES = {
  stays_first_24h: { label: 'Stays #1 for 24h', multiplier: 1.8, icon: Trophy, color: '#f59e0b' },
  bankrupt_24h: { label: 'Goes bankrupt in 24h', multiplier: 3.0, icon: Skull, color: '#ef4444' },
  price_up_next: { label: 'Price up next cycle', multiplier: 1.5, icon: ArrowUp, color: '#22c55e' },
  price_down_next: { label: 'Price down next cycle', multiplier: 1.5, icon: ArrowDown, color: '#ef4444' },
}

export default function Betting() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [agents, setAgents] = useState([])
  const [myBets, setMyBets] = useState([])
  const [pool, setPool] = useState({})
  const [walletLinked, setWalletLinked] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [selectedBetType, setSelectedBetType] = useState(null)
  const [betAmount, setBetAmount] = useState('')
  const [placing, setPlacing] = useState(false)
  const [txStatus, setTxStatus] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tab, setTab] = useState('bet')
  const [txHash, setTxHash] = useState(undefined)
  const [confirmedTxHash, setConfirmedTxHash] = useState(null)

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  const fetchAgents = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/agents`)
      setAgents((data || []).filter(a => ['active', 'dominant'].includes(a.status)))
    } catch { }
  }, [])

  const fetchMyBets = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await axios.get(`${API}/api/bets/user/${user.id}`)
      setMyBets(data || [])
    } catch { }
  }, [user])

  const fetchPool = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/bets/pool`)
      setPool(data || {})
    } catch { }
  }, [])

  useEffect(() => {
    fetchAgents()
    fetchPool()
    const iv = setInterval(() => { fetchAgents(); fetchPool() }, 30000)
    return () => clearInterval(iv)
  }, [fetchAgents, fetchPool])

  useEffect(() => { fetchMyBets() }, [fetchMyBets])

  useEffect(() => {
    const onBetPlaced = () => { fetchPool(); fetchMyBets() }
    const onBetResolved = () => { fetchPool(); fetchMyBets() }
    socket.on('bet-placed', onBetPlaced)
    socket.on('bet-resolved', onBetResolved)
    return () => {
      socket.off('bet-placed', onBetPlaced)
      socket.off('bet-resolved', onBetResolved)
    }
  }, [fetchPool, fetchMyBets])

  useEffect(() => {
    if (!isConnected || !address || !user) {
      setWalletLinked(false)
      return
    }
    supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.wallet_address === address) {
          setWalletLinked(true)
        } else if (data) {
          supabase.from('user_wallets')
            .update({ wallet_address: address, connected_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .then(() => setWalletLinked(true))
        } else {
          supabase.from('user_wallets')
            .insert({ user_id: user.id, wallet_address: address, total_bets: 0, total_won: 0, total_lost: 0, connected_at: new Date().toISOString() })
            .then(() => setWalletLinked(true))
        }
      })
  }, [isConnected, address, user])

  useEffect(() => {
    if (!isConfirmed || !receipt || !placing) return

    async function recordBet() {
      try {
        setTxStatus('Recording bet...')
        const res = await axios.post(`${API}/api/bets/place`, {
          userWallet: address,
          userId: user.id,
          agentTicker: selectedAgent.ticker,
          betType: selectedBetType,
          betAmount: parseFloat(betAmount),
          txHash: receipt.transactionHash,
        })
        setConfirmedTxHash(receipt.transactionHash)
        setSuccess(`Bet placed! Potential payout: ${res.data.bet.potential_payout} ETH`)
        setPlacing(false)
        setTxStatus(null)
        setTxHash(undefined)
        setSelectedAgent(null)
        setSelectedBetType(null)
        setBetAmount('')
        fetchMyBets()
        fetchPool()
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to record bet')
        setPlacing(false)
        setTxStatus(null)
        setTxHash(undefined)
      }
    }
    recordBet()
  }, [isConfirmed, receipt])

  const handlePlaceBet = async () => {
    setError('')
    setSuccess('')
    setConfirmedTxHash(null)

    if (!selectedAgent || !selectedBetType) {
      setError('Select an agent and bet type')
      return
    }
    const amount = parseFloat(betAmount)
    if (!amount || amount < 0.001 || amount > 0.1) {
      setError('Bet must be between 0.001 and 0.1 ETH')
      return
    }
    if (chainId !== base.id) {
      setError('Please switch to Base network')
      return
    }

    setPlacing(true)
    setTxStatus('Sending ETH...')

    try {
      const hash = await sendTransactionAsync({
        to: HOUSE_WALLET,
        value: parseEther(amount.toString()),
      })
      setTxHash(hash)
      setTxStatus('Confirming transaction...')
    } catch (err) {
      const msg = err?.message || ''
      const isUserRejection =
        msg.toLowerCase().includes('rejected') ||
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('cancelled') ||
        err?.code === 4001
      setError(isUserRejection ? 'Transaction cancelled' : (msg || 'Transaction failed'))
      setPlacing(false)
      setTxStatus(null)
    }
  }

  const isOnBase = chainId === base.id

  if (!user) {
    return (
      <div className="betting-page">
        <div className="betting-auth-gate">
          <Dice5 size={48} />
          <h2>Agent Betting</h2>
          <p>Bet ETH on agent performance on Base network</p>
          <button className="btn-primary" onClick={() => navigate('/login')}>Login to Start Betting</button>
          <button className="btn-secondary" onClick={() => navigate('/signup')}>Create Account</button>
        </div>
      </div>
    )
  }

  return (
    <div className="betting-page">
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

      {!isConnected && (
        <div className="betting-connect-card">
          <Wallet size={32} />
          <h3>Connect Your Wallet</h3>
          <p>Connect an EVM wallet to place bets with ETH on Base network</p>
          <ConnectButton />
        </div>
      )}

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
          <div className="betting-tabs">
            <button className={`betting-tab ${tab === 'bet' ? 'active' : ''}`} onClick={() => setTab('bet')}>
              Place Bet
            </button>
            <button className={`betting-tab ${tab === 'my' ? 'active' : ''}`} onClick={() => { setTab('my'); fetchMyBets() }}>
              My Bets {myBets.filter(b => b.status === 'active').length > 0 && <span className="betting-tab-count">{myBets.filter(b => b.status === 'active').length}</span>}
            </button>
            <button className={`betting-tab ${tab === 'pool' ? 'active' : ''}`} onClick={() => { setTab('pool'); fetchPool() }}>
              Live Pool
            </button>
          </div>

          {error && <div className="betting-alert betting-alert-error">{error}</div>}
          {success && (
            <div className="betting-alert betting-alert-success">
              {success}
              {confirmedTxHash && (
                <a
                  href={`https://basescan.org/tx/${confirmedTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="betting-bet-tx"
                  style={{ marginLeft: 8 }}
                >
                  View on BaseScan <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}

          {tab === 'bet' && (
            <div className="betting-layout">
              <div className="betting-agents-grid">
                {agents.map(agent => {
                  const isSelected = selectedAgent?.ticker === agent.ticker
                  const agentPool = pool[agent.ticker]
                  const pct = agent.price && agent.starting_price
                    ? (((parseFloat(agent.price) - 1) / 1) * 100).toFixed(1)
                    : '0.0'

                  return (
                    <div
                      key={agent.ticker}
                      className={`betting-agent-card ${isSelected ? 'betting-agent-card--selected' : ''}`}
                      onClick={() => { setSelectedAgent(agent); setSelectedBetType(null) }}
                    >
                      <div className="betting-agent-top">
                        <AgentAvatar ticker={agent.ticker} avatarUrl={agent.avatar_url} size="md" />
                        <div className="betting-agent-info">
                          <span className="betting-agent-ticker">{agent.ticker}</span>
                          <span className="betting-agent-name">{agent.full_name}</span>
                        </div>
                        <div className="betting-agent-price">
                          <span className="betting-agent-price-val">${parseFloat(agent.price).toFixed(2)}</span>
                          <span className={`betting-agent-pct ${parseFloat(pct) >= 0 ? 'green' : 'red'}`}>
                            {parseFloat(pct) >= 0 ? '+' : ''}{pct}%
                          </span>
                        </div>
                      </div>

                      {agentPool && (
                        <div className="betting-agent-pool">
                          <span>{agentPool.total_eth.toFixed(4)} ETH</span>
                          <span>{agentPool.total_bets} bet{agentPool.total_bets !== 1 ? 's' : ''}</span>
                        </div>
                      )}

                      {isSelected && (
                        <div className="betting-types-grid">
                          {Object.entries(BET_TYPES).map(([key, bt]) => {
                            const Icon = bt.icon
                            const isActive = selectedBetType === key
                            return (
                              <button
                                key={key}
                                className={`betting-type-btn ${isActive ? 'betting-type-btn--active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedBetType(key) }}
                              >
                                <Icon size={14} style={{ color: bt.color }} />
                                <span className="betting-type-label">{bt.label}</span>
                                <span className="betting-type-mult">{bt.multiplier}x</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {selectedAgent && selectedBetType && (
                <div className="betting-slip">
                  <h3>Bet Slip</h3>
                  <div className="betting-slip-summary">
                    <div className="betting-slip-row">
                      <span>Agent</span>
                      <span className="betting-slip-val">{selectedAgent.ticker}</span>
                    </div>
                    <div className="betting-slip-row">
                      <span>Bet</span>
                      <span className="betting-slip-val">{BET_TYPES[selectedBetType].label}</span>
                    </div>
                    <div className="betting-slip-row">
                      <span>Multiplier</span>
                      <span className="betting-slip-val">{BET_TYPES[selectedBetType].multiplier}x</span>
                    </div>
                  </div>

                  <div className="betting-amount-input">
                    <label>Amount (ETH)</label>
                    <div className="betting-amount-row">
                      <input
                        type="number"
                        min="0.001"
                        max="0.1"
                        step="0.001"
                        value={betAmount}
                        onChange={e => setBetAmount(e.target.value)}
                        placeholder="0.001 - 0.1"
                      />
                      <div className="betting-quick-amounts">
                        {[0.005, 0.01, 0.025, 0.05, 0.1].map(v => (
                          <button key={v} onClick={() => setBetAmount(v.toString())} className="betting-quick-btn">{v} ETH</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {betAmount && parseFloat(betAmount) >= 0.001 && (
                    <div className="betting-slip-payout">
                      <span>Potential Payout</span>
                      <span className="betting-slip-payout-val">
                        {(parseFloat(betAmount) * BET_TYPES[selectedBetType].multiplier * 0.9).toFixed(4)} ETH
                      </span>
                      <span className="betting-slip-payout-note">90% of {BET_TYPES[selectedBetType].multiplier}x (10% house fee)</span>
                    </div>
                  )}

                  <button
                    className="btn-place-bet"
                    onClick={handlePlaceBet}
                    disabled={placing || isSending || isConfirming || !betAmount || parseFloat(betAmount) < 0.001}
                  >
                    {placing || isSending || isConfirming ? (
                      <><Loader size={16} className="spin" /> {txStatus || 'Processing...'}</>
                    ) : (
                      `Place Bet — ${betAmount || '0'} ETH`
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'my' && (
            <div className="betting-my-bets">
              {myBets.length === 0 ? (
                <div className="betting-empty">
                  <Dice5 size={32} />
                  <p>No bets yet. Place your first bet!</p>
                </div>
              ) : (
                <div className="betting-bets-list">
                  {myBets.map(bet => {
                    const bt = BET_TYPES[bet.bet_type]
                    const remaining = new Date(bet.expires_at) - Date.now()
                    const hoursLeft = Math.max(0, Math.floor(remaining / 3600000))
                    const minsLeft = Math.max(0, Math.floor((remaining % 3600000) / 60000))

                    return (
                      <div key={bet.id} className={`betting-bet-card betting-bet-${bet.status}`}>
                        <div className="betting-bet-top">
                          <span className="betting-bet-ticker">{bet.agent_ticker}</span>
                          <span className={`betting-bet-status betting-bet-status--${bet.status}`}>
                            {bet.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="betting-bet-type">{bt?.label || bet.bet_type}</div>
                        <div className="betting-bet-details">
                          <div className="betting-bet-detail">
                            <span>Bet</span>
                            <span>{parseFloat(bet.bet_amount).toFixed(4)} ETH</span>
                          </div>
                          <div className="betting-bet-detail">
                            <span>Payout</span>
                            <span>{parseFloat(bet.potential_payout).toFixed(4)} ETH</span>
                          </div>
                          {bet.status === 'active' && (
                            <div className="betting-bet-detail">
                              <Clock size={12} />
                              <span>{hoursLeft}h {minsLeft}m left</span>
                            </div>
                          )}
                        </div>
                        {bet.tx_hash && (
                          <a
                            href={`https://basescan.org/tx/${bet.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="betting-bet-tx"
                          >
                            View TX <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'pool' && (
            <div className="betting-pool">
              {Object.keys(pool).length === 0 ? (
                <div className="betting-empty">
                  <TrendingUp size={32} />
                  <p>No active bets in the pool yet</p>
                </div>
              ) : (
                <div className="betting-pool-grid">
                  {Object.entries(pool).map(([ticker, data]) => {
                    const agent = agents.find(a => a.ticker === ticker)
                    return (
                      <div key={ticker} className="betting-pool-card">
                        <div className="betting-pool-agent">
                          <AgentAvatar ticker={ticker} avatarUrl={agent?.avatar_url} size="sm" />
                          <span className="betting-pool-ticker">{ticker}</span>
                          <span className="betting-pool-total">{data.total_eth.toFixed(4)} ETH</span>
                          <span className="betting-pool-count">{data.total_bets} bet{data.total_bets !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="betting-pool-types">
                          {Object.entries(data.by_type).map(([type, td]) => (
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
