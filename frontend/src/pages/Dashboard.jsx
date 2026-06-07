import { useEffect, useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DollarSign, ArrowLeftRight, Radio, Users, Crown, X, ExternalLink } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { asArray } from '../lib/api'

const API = import.meta.env.VITE_API_URL

const AGENT_COLORS = {
  RAVI: '#00b87a', ZEUS: '#f5a623',
  NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358'
}

function tokenInvestedEth(agent) {
  const h = agent?.token_holdings
  if (!h || typeof h !== 'object') return 0
  return Object.values(h).reduce((s, t) => s + parseFloat(t?.eth_in || 0), 0)
}

function tokensHeldCount(agent) {
  const h = agent?.token_holdings
  if (!h || typeof h !== 'object') return 0
  return Object.values(h).filter((t) => t && parseFloat(t.amount) > 0).length
}

function realActivityRows(rows) {
  return asArray(rows).filter((item) => ['real_trade', 'fee'].includes(item.action_type))
}


function agentColor(ticker) {
  const presets = { RAVI: '#00b87a', ZEUS: '#f5a623', NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358' }
  if (presets[ticker]) return presets[ticker]
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = (h + ticker.charCodeAt(i) * 47) % 360
  return `hsl(${h}, 60%, 50%)`
}

export default function Dashboard({ agents: liveAgents, treasury: liveTreasury }) {
  const [agents, setAgents] = useState(liveAgents || [])
  const [treasury, setTreasury] = useState(liveTreasury || null)
  const [activity, setActivity] = useState([])
  const [tokenTrades, setTokenTrades] = useState([])
  const [holdingsModalAgent, setHoldingsModalAgent] = useState(null)

  const fetchAll = async () => {
    try {
      const [ag, tr, ac, tt] = await Promise.all([
        axios.get(`${API}/api/agents`).catch(() => ({ data: [] })),
        axios.get(`${API}/api/treasury`).catch(() => ({ data: null })),
        axios.get(`${API}/api/activity?limit=20`).catch(() => ({ data: [] })),
        axios.get(`${API}/api/token-trades?limit=1000`).catch(() => ({ data: [] }))
      ])
      const agentList = asArray(ag.data)
      setAgents(agentList)
      setTreasury(tr.data)
      setActivity(realActivityRows(ac.data).slice(0, 8))
      setTokenTrades(asArray(tt.data))
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    }
  }

  useEffect(() => {
    // Fast path: load agents immediately for leader + portfolio cards
    Promise.all([
      axios.get(`${API}/api/agents`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/treasury`).catch(() => ({ data: null }))
    ]).then(([ag, tr]) => {
      const quick = asArray(ag.data)
      if (quick.length) setAgents(quick)
      if (tr.data) setTreasury(tr.data)
    })
    // Full load runs in parallel
    fetchAll()
  }, [])

  useEffect(() => {
    const activityInterval = setInterval(() => {
      axios.get(`${API}/api/activity?limit=20`).then(r => setActivity(realActivityRows(r.data).slice(0, 8))).catch(() => {})
    }, 15000)
    return () => clearInterval(activityInterval)
  }, [])

  useEffect(() => {
    if (Array.isArray(liveAgents) && liveAgents.length) setAgents(liveAgents)
    if (liveTreasury) setTreasury(liveTreasury)
  }, [liveAgents, liveTreasury])

  const ethUsd = (() => {
    const ref = agents.find((a) => parseFloat(a.real_eth || 0) > 0 && parseFloat(a.real_usd || 0) > 0)
    return ref ? parseFloat(ref.real_usd) / parseFloat(ref.real_eth) : 0
  })()
  const portfolioUsd = (a) => parseFloat(a.real_usd || 0) + tokenInvestedEth(a) * ethUsd
  const sorted = [...agents].sort((a, b) => portfolioUsd(b) - portfolioUsd(a))
  const leader = sorted[0]
  const tradeCounts = tokenTrades.reduce((acc, t) => {
    if (t.agent_ticker) acc[t.agent_ticker] = (acc[t.agent_ticker] || 0) + 1
    return acc
  }, {})
  const recentTradeChart = [...tokenTrades]
    .slice(0, 20)
    .reverse()
    .map((t, i) => ({
      n: i + 1,
      eth: parseFloat(t.eth_amount || 0),
      side: t.side,
      ticker: t.agent_ticker,
      symbol: t.token_symbol,
    }))

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Exchange Overview</div>
        <div className="page-subtitle">Real on-chain agent trading on Base — wallet balances, swaps, and fees</div>
      </div>

      {/* KPI Row */}
      <ScrollReveal delay={0}>
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          {
            label: 'Treasury Collected',
            value: `$${parseFloat(treasury?.total_fees || 0).toFixed(2)}`,
            decimals: 2,
            sub: '2% fee per real trade',
            icon: DollarSign,
            color: '#00b87a',
            bg: '#edfaf4'
          },
          {
            label: 'Total Trades',
            value: treasury?.total_trades || 0,
            sub: 'Real on-chain trades',
            icon: ArrowLeftRight,
            color: '#2563eb',
            bg: '#eff4ff'
          },
          {
            label: 'Real Coins Held',
            value: agents.reduce((n, a) => n + Object.values(a.token_holdings || {}).filter(v => v && parseFloat(v.amount) > 0).length, 0),
            sub: 'On-chain Base tokens',
            icon: Radio,
            color: '#f5a623',
            bg: '#fff8ed'
          },
          {
            label: 'Active Agents',
            value: agents.filter(a => a.status === 'active' || a.status === 'dominant').length,
            sub: `${agents.filter(a => a.status === 'dominant').length} dominant`,
            icon: Users,
            color: '#7c3aed',
            bg: '#f5f0ff'
          }
        ].map((kpi, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                {kpi.label}
              </div>
              <div className="stat-number" style={{ color: kpi.color, marginBottom: '4px' }}>
              <CountUp value={typeof kpi.value === 'string' ? kpi.value.replace(/[^0-9.]/g, '') : kpi.value}
                prefix={typeof kpi.value === 'string' && kpi.value.startsWith('$') ? '$' : ''}
                suffix={kpi.suffix || ''}
                decimals={typeof kpi.decimals === 'number' ? kpi.decimals : (typeof kpi.value === 'string' && kpi.value.includes('.') ? 2 : 0)}
              />
            </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{kpi.sub}</div>
            </div>
            <div style={{ background: kpi.bg, padding: '10px', borderRadius: '10px' }}>
              <kpi.icon size={18} color={kpi.color} />
            </div>
          </div>
        ))}
      </div>
      </ScrollReveal>

      <ScrollReveal delay={100}>
      <div className="grid-2" style={{ marginBottom: '20px' }}>

        {/* Real Trade Chart */}
        <div className="card" style={{ gridColumn: '1 / 2' }}>
          <div className="card-header">
            <div className="card-title">Recent On-Chain Trade Volume</div>
            <span
              className="badge badge-green"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: 'currentColor',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              LIVE
            </span>
          </div>
          {recentTradeChart.length === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '0.8rem' }}>
              No real on-chain trades yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={recentTradeChart}>
                <XAxis dataKey="n" tick={{ fontSize: 10, fill: '#8896a8' }} label={{ value: 'Recent Trades', position: 'insideBottom', fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10, fill: '#8896a8' }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid #1e2730', borderRadius: '8px', fontSize: '0.72rem' }}
                  formatter={(v, _n, p) => [`${parseFloat(v).toFixed(6)} ETH`, `${p?.payload?.ticker || ''} ${(p?.payload?.side || '').toUpperCase()} $${p?.payload?.symbol || ''}`]}
                />
                <Bar dataKey="eth" radius={[4, 4, 0, 0]}>
                  {recentTradeChart.map((d, i) => (
                    <Cell key={i} fill={d.side === 'buy' ? '#00b87a' : '#f03358'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Leader + Risk */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {leader && (
            <div className="card" style={{
              background: 'linear-gradient(135deg, #0d1117 0%, #1a2a1a 100%)',
              border: '1px solid #00b87a33'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#00b87a', letterSpacing: '2px', marginBottom: '6px' }}>
                    👑 CURRENT LEADER
                  </div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.8rem', fontWeight: 800, color: '#ffffff' }}>
                    {leader.ticker}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#4a6070', marginBottom: '8px' }}>{leader.full_name}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00b87a' }}>
                    ${portfolioUsd(leader).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#00b87a' }}>
                    highest real portfolio value
                  </div>
                </div>
                <Crown size={32} color="#00b87a" style={{ opacity: 0.3 }} />
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1e3020' }}>
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#3a5040' }}>ETH</div>
                  <div style={{ fontSize: '0.85rem', color: '#00b87a', fontWeight: 600 }}>{parseFloat(leader.real_eth || 0).toFixed(5)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#3a5040' }}>TOKENS</div>
                  <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>{tokensHeldCount(leader)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#3a5040' }}>TRADES</div>
                  <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>{tradeCounts[leader.ticker] || 0}</div>
                </div>
              </div>
            </div>
          )}

        </div>
        </div>
      </ScrollReveal>

      {/* Top Portfolios + Most Active Traders */}
      {(() => {
        const topPortfolios = [...agents].sort((a, b) => portfolioUsd(b) - portfolioUsd(a)).slice(0, 5)
        const mostActive = [...agents].sort((a, b) => (tradeCounts[b.ticker] || 0) - (tradeCounts[a.ticker] || 0)).slice(0, 5)

        const renderRow = (a, i, mode) => {
          const color = mode === 'portfolio' ? 'var(--green)' : 'var(--blue)'
          return (
            <div key={a.ticker} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 0', borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text3)', width: 18, textAlign: 'right' }}>#{i + 1}</span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: AGENT_COLORS[a.ticker] || agentColor(a.ticker), flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{a.ticker}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>
                  {mode === 'portfolio' ? `$${portfolioUsd(a).toFixed(2)}` : `${tradeCounts[a.ticker] || 0} trades`}
                </span>
              </div>
            </div>
          )
        }

        return (
          <ScrollReveal delay={200}>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title" style={{ color: 'var(--green)' }}>TOP PORTFOLIOS</div>
                <span className="badge badge-green">TOP 5</span>
              </div>
              {topPortfolios.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: '0.72rem' }}>No agents yet</div>}
              {topPortfolios.map((a, i) => renderRow(a, i, 'portfolio'))}
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title" style={{ color: 'var(--blue)' }}>MOST ACTIVE TRADERS</div>
                <span className="badge badge-gray">TOP 5</span>
              </div>
              {mostActive.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: '0.72rem' }}>No real trades yet</div>}
              {mostActive.map((a, i) => renderRow(a, i, 'trades'))}
            </div>
            </div>
          </ScrollReveal>
        )
      })()}

      {/* All Agents Table */}
      {(() => {
        const visible = agents.filter(a => ['active', 'dominant'].includes(a.status))
        if (visible.length === 0) return null
        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-title">All Agents</div>
              <span className="badge badge-green">{visible.length}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Ticker</th><th>Full Name</th><th>Style</th>
                    <th style={{ textAlign: 'right' }}>Portfolio</th>
                    <th style={{ textAlign: 'right' }}>ETH Balance</th>
                    <th style={{ textAlign: 'right' }}>Invested</th>
                    <th>Tokens</th>
                    <th style={{ textAlign: 'right' }}>Trades</th>
                    <th>Creator</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(a => {
                    const color = AGENT_COLORS[a.ticker] || agentColor(a.ticker)
                    const handle = (a.creator_twitter || '').replace(/^@/, '')
                    const heldCount = tokensHeldCount(a)
                    const invested = tokenInvestedEth(a)
                    return (
                      <tr key={a.ticker}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="sm" />
                            <strong>${a.ticker}</strong>
                          </div>
                        </td>
                        <td>{a.full_name}</td>
                        <td style={{ fontSize: '0.68rem', color: 'var(--text2)' }}>{a.style}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>
                          ${portfolioUsd(a).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {parseFloat(a.real_eth || 0).toFixed(5)}
                          <div style={{ fontSize: '0.62rem', color: 'var(--text3)' }}>${parseFloat(a.real_usd || 0).toFixed(2)}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text2)' }}>
                          {invested > 0 ? `${invested.toFixed(5)} ETH` : '—'}
                        </td>
                        <td>
                          {heldCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setHoldingsModalAgent(a)}
                              className="badge badge-green"
                              style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
                            >
                              {heldCount} · See
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="badge badge-red"
                              style={{ cursor: 'not-allowed', border: 'none', font: 'inherit', opacity: 0.6 }}
                            >
                              None
                            </button>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--blue)', fontWeight: 700 }}>{tradeCounts[a.ticker] || 0}</td>
                        <td style={{ fontSize: '0.68rem' }}>
                          {a.creator_name && <span>{a.creator_name}</span>}
                          {!a.creator_name && !handle && <span style={{ color: 'var(--text3)' }}>Anonymous</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

{/* Activity Feed Preview */}
<div className="card">
        <div className="card-header">
          <div className="card-title">Recent Activity</div>
          <span className="badge badge-red">STREAMING</span>
        </div>
        {activity.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: '0.8rem' }}>
            No real on-chain activity yet.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {activity.map((item, i) => {
            const amount = parseFloat(item.amount || 0)
            const amountText = item.action_type === 'real_trade'
              ? `${amount.toFixed(5)} ETH`
              : item.action_type === 'fee'
                ? `$${amount.toFixed(4)}`
                : amount > 0 ? `$${amount.toFixed(2)}` : '$0.00'
            return (
              <div key={item.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    background: (AGENT_COLORS[item.agent_ticker] || agentColor(item.agent_ticker || '')) + '20',
                    color: AGENT_COLORS[item.agent_ticker] || agentColor(item.agent_ticker || ''),
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    fontFamily: "'Geist Mono', monospace"
                  }}>
                    {item.agent_ticker}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{item.action}</span>
                  {item.tx_hash && (
                    <a href={`https://basescan.org/tx/${item.tx_hash}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--blue)', fontSize: '0.68rem', fontWeight: 600, textDecoration: 'none' }}>
                      <ExternalLink size={11} /> View
                    </a>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: amount > 0 ? 'var(--green)' : 'var(--text3)', fontWeight: 600 }}>
                    {amountText}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>
                  {new Date(item.created_at.endsWith('Z') || item.created_at.includes('+') ? item.created_at : item.created_at + 'Z').toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {holdingsModalAgent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Holdings details"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setHoldingsModalAgent(null)}
        >
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px',
              minWidth: '280px',
              maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>
                {holdingsModalAgent.ticker} — Token Holdings (Base)
              </span>
              <button
                type="button"
                onClick={() => setHoldingsModalAgent(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--text3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
              {holdingsModalAgent.token_holdings && typeof holdingsModalAgent.token_holdings === 'object' && Object.keys(holdingsModalAgent.token_holdings).length > 0
                ? Object.entries(holdingsModalAgent.token_holdings).map(([address, h]) => {
                    const amount = parseFloat(h?.amount || 0)
                    const ethIn = h?.eth_in != null ? parseFloat(h.eth_in).toFixed(6) : null
                    return (
                      <div key={address} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>${h?.symbol || 'TOKEN'}</div>
                          <a href={`https://basescan.org/token/${address}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '0.6rem', color: 'var(--blue)', textDecoration: 'none' }}>
                            {address.slice(0, 6)}…{address.slice(-4)}
                          </a>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div>{amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                          {ethIn != null && <div style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>{ethIn} ETH in</div>}
                        </div>
                      </div>
                    )
                  })
                : <div style={{ padding: '8px 0', color: 'var(--text3)' }}>No token holdings</div>}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}