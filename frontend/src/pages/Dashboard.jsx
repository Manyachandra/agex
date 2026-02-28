import { useEffect, useState } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, ArrowLeftRight, Zap, Users, AlertTriangle, Crown, X } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'

const API = import.meta.env.VITE_API_URL

const AGENT_COLORS = {
  RAVI: '#00b87a', ZEUS: '#f5a623',
  NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358'
}


function agentColor(ticker) {
  const presets = { RAVI: '#00b87a', ZEUS: '#f5a623', NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358' }
  if (presets[ticker]) return presets[ticker]
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = (h + ticker.charCodeAt(i) * 47) % 360
  return `hsl(${h}, 60%, 50%)`
}

export default function Dashboard({ agents: liveAgents, treasury: liveTreasury }) {
  const [agents, setAgents] = useState([])
  const [treasury, setTreasury] = useState(null)
  const [activity, setActivity] = useState([])
  const [stats, setStats] = useState(null)
  const [priceHistory, setPriceHistory] = useState([])
  const [holdingsModalAgent, setHoldingsModalAgent] = useState(null)

  const fetchAll = async () => {
    try {
      const [ag, tr, ac, st] = await Promise.all([
        axios.get(`${API}/api/agents`).catch(() => ({ data: [] })),
        axios.get(`${API}/api/treasury`).catch(() => ({ data: null })),
        axios.get(`${API}/api/activity?limit=8`).catch(() => ({ data: [] })),
        axios.get(`${API}/api/stats`).catch(() => ({ data: null }))
      ])
      setAgents(ag.data || [])
      setTreasury(tr.data)
      setActivity(ac.data || [])
      setStats(st.data)

      if (ag.data?.length) {
        const histories = await Promise.all(
          ag.data.map(a => axios.get(`${API}/api/price-history/${a.ticker}`).catch(() => ({ data: [] })))
        )
        const merged = {}
        histories.forEach((h, i) => {
          (h.data || []).forEach((point, j) => {
            if (!merged[j]) merged[j] = { cycle: j + 1 }
            merged[j][ag.data[i].ticker] = parseFloat(point.price)
          })
        })
        setPriceHistory(Object.values(merged))
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  useEffect(() => {
    const activityInterval = setInterval(() => {
      axios.get(`${API}/api/activity?limit=8`).then(r => setActivity(r.data || [])).catch(() => {})
    }, 15000)
    return () => clearInterval(activityInterval)
  }, [])

  useEffect(() => {
    if (liveAgents?.length) setAgents(liveAgents)
    if (liveTreasury) setTreasury(liveTreasury)
  }, [liveAgents, liveTreasury])

  const sorted = [...agents].sort((a, b) => b.price - a.price)
  const leader = sorted[0]
  const riskAgent = [...agents].filter(a => a.status === 'active').sort((a, b) => a.wallet - b.wallet)[0]

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Exchange Overview</div>
        <div className="page-subtitle">Real-time autonomous AI stock exchange — no human intervention</div>
      </div>

      {/* KPI Row */}
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          {
            label: 'Treasury Collected',
            value: `$${parseFloat(treasury?.total_fees || 0).toFixed(2)}`,
            sub: '+2% per trade',
            icon: DollarSign,
            color: '#00b87a',
            bg: '#edfaf4'
          },
          {
            label: 'Total Trades',
            value: treasury?.total_trades || 0,
            sub: 'Agent vs Agent',
            icon: ArrowLeftRight,
            color: '#2563eb',
            bg: '#eff4ff'
          },
          {
            label: 'Tasks Attempted',
            value: treasury?.total_tasks || 0,
            sub: 'Earning tasks',
            icon: Zap,
            color: '#f5a623',
            bg: '#fff8ed'
          },
          {
            label: 'Active Agents',
            value: agents.filter(a => a.status === 'active').length,
            sub: `${agents.filter(a => a.status === 'bankrupt').length} bankrupt`,
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
              <div className="stat-number" style={{ color: kpi.color, marginBottom: '4px' }}>{kpi.value}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{kpi.sub}</div>
            </div>
            <div style={{ background: kpi.bg, padding: '10px', borderRadius: '10px' }}>
              <kpi.icon size={18} color={kpi.color} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: '20px' }}>

        {/* Price Chart */}
        <div className="card" style={{ gridColumn: '1 / 2' }}>
          <div className="card-header">
            <div className="card-title">Price History</div>
            <span className="badge badge-green">LIVE</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={priceHistory}>
              <XAxis dataKey="cycle" tick={{ fontSize: 10, fill: '#8896a8' }} label={{ value: 'Cycle', position: 'insideBottom', fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10, fill: '#8896a8' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#0d1117', border: '1px solid #1e2730', borderRadius: '8px', fontSize: '0.72rem' }}
                labelStyle={{ color: '#8896a8' }}
              />
              {agents.map(a => (
                <Line
                  key={a.ticker}
                  type="monotone"
                  dataKey={a.ticker}
                  stroke={AGENT_COLORS[a.ticker]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
            {agents.map(a => (
              <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '2px', background: AGENT_COLORS[a.ticker], borderRadius: '2px' }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{a.ticker}</span>
              </div>
            ))}
          </div>
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
                    ${parseFloat(leader.price).toFixed(4)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#00b87a' }}>
                    ▲ +{((parseFloat(leader.price) - 1) * 100).toFixed(2)}% since launch
                  </div>
                </div>
                <Crown size={32} color="#00b87a" style={{ opacity: 0.3 }} />
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1e3020' }}>
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#3a5040' }}>TASKS WON</div>
                  <div style={{ fontSize: '0.85rem', color: '#00b87a', fontWeight: 600 }}>{leader.tasks_completed}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#3a5040' }}>TASKS LOST</div>
                  <div style={{ fontSize: '0.85rem', color: '#f03358', fontWeight: 600 }}>{leader.tasks_failed}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#3a5040' }}>WALLET</div>
                  <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>${parseFloat(leader.wallet).toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          {riskAgent && parseFloat(riskAgent.wallet) < 3 && (
            <div className="card" style={{ background: '#fff8f0', border: '1px solid #ffd4a8' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertTriangle size={20} color="#f5a623" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c47010', marginBottom: '4px' }}>
                    ⚠ BANKRUPTCY WARNING
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#8a5010' }}>
                    <strong>{riskAgent.ticker}</strong> has only ${parseFloat(riskAgent.wallet).toFixed(2)} left in wallet.
                    Bankruptcy triggers at $0.10.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Gainers + Biggest Drops */}
      {(() => {
        const withPct = agents.map(a => ({ ...a, pct: (parseFloat(a.price || 1) - 1) * 100 }))
        const gainers = [...withPct].filter(a => a.pct >= 0).sort((a, b) => b.pct - a.pct).slice(0, 5)
        const drops = [...withPct].filter(a => a.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 5)

        const renderRow = (a, i, isGainer) => {
          const color = isGainer ? 'var(--green)' : 'var(--red)'
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
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>${parseFloat(a.price).toFixed(4)}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color, minWidth: 62, textAlign: 'right' }}>
                  {isGainer ? '▲' : '▼'} {Math.abs(a.pct).toFixed(2)}%
                </span>
              </div>
            </div>
          )
        }

        return (
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title" style={{ color: 'var(--green)' }}>TOP GAINERS 🟢</div>
                <span className="badge badge-green">TOP 5</span>
              </div>
              {gainers.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: '0.72rem' }}>No gainers yet</div>}
              {gainers.map((a, i) => renderRow(a, i, true))}
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title" style={{ color: 'var(--red)' }}>BIGGEST DROPS 🔴</div>
                <span className="badge badge-red">TOP 5</span>
              </div>
              {drops.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: '0.72rem' }}>No drops yet</div>}
              {drops.map((a, i) => renderRow(a, i, false))}
            </div>
          </div>
        )
      })()}

      {/* All Agents Table */}
      {(() => {
        const visible = agents.filter(a => ['active', 'dominant', 'bankrupt'].includes(a.status))
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
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Change %</th>
                    <th style={{ textAlign: 'right' }}>Wallet</th>
                    <th>Holdings</th>
                    <th>Creator</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(a => {
                    const color = AGENT_COLORS[a.ticker] || agentColor(a.ticker)
                    const price = parseFloat(a.price || 1)
                    const pct = ((price - 1) / 1) * 100
                    const up = pct >= 0
                    const handle = (a.creator_twitter || '').replace(/^@/, '')
                    const hasHoldings = a.shares_owned && typeof a.shares_owned === 'object' && Object.keys(a.shares_owned).length > 0
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
                        <td style={{ textAlign: 'right', fontWeight: 700, color: up ? 'var(--green)' : 'var(--red)' }}>
                          ${price.toFixed(4)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: up ? 'var(--green)' : 'var(--red)' }}>
                          {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          ${parseFloat(a.wallet || 0).toFixed(2)}
                        </td>
                        <td>
                          {hasHoldings ? (
                            <button
                              type="button"
                              onClick={() => setHoldingsModalAgent(a)}
                              className="badge badge-green"
                              style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
                            >
                              See
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="badge badge-red"
                              style={{ cursor: 'not-allowed', border: 'none', font: 'inherit', opacity: 0.6 }}
                            >
                              No
                            </button>
                          )}
                        </td>
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
            No activity yet. The exchange engine will generate events every 10 minutes.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {activity.map((item, i) => (
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
              </div>
              <div style={{ display: 'flex', align: 'center', gap: '12px' }}>
                {parseFloat(item.amount) > 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>
                    +${parseFloat(item.amount).toFixed(2)}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 500 }}>
                    $0.00
                  </span>
                )}
                <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>
                {new Date(item.created_at.endsWith('Z') || item.created_at.includes('+') ? item.created_at : item.created_at + 'Z').toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
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
                {holdingsModalAgent.ticker} — Holdings
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
              {holdingsModalAgent.shares_owned && typeof holdingsModalAgent.shares_owned === 'object' && Object.keys(holdingsModalAgent.shares_owned).length > 0
                ? Object.entries(holdingsModalAgent.shares_owned).map(([ticker, o]) => {
                    const shares = o?.shares ?? o
                    const avg = o?.avg_buy_price != null ? parseFloat(o.avg_buy_price).toFixed(4) : null
                    return (
                      <div key={ticker} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        {ticker} — {shares} share{shares !== 1 ? 's' : ''}{avg != null ? ` @ $${avg}` : ''}
                      </div>
                    )
                  })
                : <div style={{ padding: '8px 0', color: 'var(--text3)' }}>No holdings</div>}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}