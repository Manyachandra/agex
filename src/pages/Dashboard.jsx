import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid
} from 'recharts'
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { CountUp } from '../components/ScrollReveal'
import { asArray } from '../lib/api'
import { explorerTx, explorerToken } from '../lib/chains'
import { API_BASE as API } from '../lib/config'

const ACTIVITY_PAGE_SIZE = 8
const AGENTS_PAGE_SIZE = 10

const AGENT_COLORS = {
  RAVI: '#18B368', ZEUS: '#FFB547',
  NOVA: '#9A7DFF', BRAHMA: '#5B6CFF', KIRA: '#FF5A70'
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
  const presets = { RAVI: '#18B368', ZEUS: '#FFB547', NOVA: '#9A7DFF', BRAHMA: '#5B6CFF', KIRA: '#FF5A70' }
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
  const [activityPage, setActivityPage] = useState(1)
  const [agentsPage, setAgentsPage] = useState(1)

  // Agents/treasury come from AppLayout — only fetch chart + activity extras here.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      axios.get(`${API}/api/activity?limit=40&types=real_trade,fee`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/token-trades?limit=200&fields=slim`).catch(() => ({ data: [] })),
    ]).then(([ac, tt]) => {
      if (cancelled) return
      setActivity(realActivityRows(ac.data))
      setTokenTrades(asArray(tt.data))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const activityInterval = setInterval(() => {
      axios.get(`${API}/api/activity?limit=40&types=real_trade,fee`)
        .then((r) => setActivity(realActivityRows(r.data)))
        .catch(() => {})
    }, 30000)
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

  const activityTotalPages = Math.max(1, Math.ceil(activity.length / ACTIVITY_PAGE_SIZE))
  const activityPageClamped = Math.min(activityPage, activityTotalPages)
  const paginatedActivity = activity.slice(
    (activityPageClamped - 1) * ACTIVITY_PAGE_SIZE,
    activityPageClamped * ACTIVITY_PAGE_SIZE
  )

  // Multi-agent mountain: aggregate on-chain ETH volume per agent (top traders)
  const agentFlowChart = (() => {
    const byTicker = {}
    for (const t of tokenTrades) {
      const ticker = t.agent_ticker
      if (!ticker) continue
      if (!byTicker[ticker]) {
        byTicker[ticker] = { ticker, eth: 0, buys: 0, sells: 0, trades: 0 }
      }
      const eth = parseFloat(t.eth_amount || 0)
      byTicker[ticker].eth += eth
      byTicker[ticker].trades += 1
      const side = (t.side || '').toLowerCase()
      if (side === 'buy') byTicker[ticker].buys += eth
      if (side === 'sell') byTicker[ticker].sells += eth
    }
    const ranked = Object.values(byTicker)
      .sort((a, b) => b.eth - a.eth)
      .slice(0, 10)
    if (ranked.length === 0) return []

    // Pyramid order: highest volume at center, next ranks alternate left/right
    let center = null
    const left = []
    const right = []
    ranked.forEach((r, i) => {
      if (i === 0) center = r
      else if (i % 2 === 1) left.unshift(r)
      else right.push(r)
    })
    const ordered = [...left, ...(center ? [center] : []), ...right]

    const peaks = ordered.map((r) => ({
      label: r.ticker,
      ticker: r.ticker,
      eth: Number(r.eth.toFixed(6)),
      buys: Number(r.buys.toFixed(6)),
      sells: Number(r.sells.toFixed(6)),
      trades: r.trades,
    }))
    return [
      { label: '', ticker: '', eth: 0, buys: 0, sells: 0, trades: 0 },
      ...peaks,
      { label: '', ticker: '', eth: 0, buys: 0, sells: 0, trades: 0 },
    ]
  })()

  return (
    <div className="fade-in desk">
      <div className="terminal-bar">
        <div>
          <div className="terminal-bar-title">Agent Exchange Terminal</div>
          <div className="terminal-bar-sub">Live Robinhood Chain desk - wallets, swaps, fees, and agent rank</div>
        </div>
      
      </div>

      <div className="terminal-metrics">
        {[
          {
            label: 'Treasury',
            value: `$${parseFloat(treasury?.total_fees || 0).toFixed(2)}`,
            decimals: 2,
            sub: '2% fee per real trade',
            color: '#18B368',
          },
          {
            label: 'Trades',
            value: treasury?.total_trades || 0,
            sub: 'On-chain executions',
            color: '#5B6CFF',
          },
          {
            label: 'Coins Held',
            value: agents.reduce((n, a) => n + Object.values(a.token_holdings || {}).filter(v => v && parseFloat(v.amount) > 0).length, 0),
            sub: 'Open on-chain positions',
            color: '#FFB547',
          },
          {
            label: 'Agents',
            value: agents.length,
            sub: 'On the exchange',
            color: '#9A7DFF',
          }
        ].map((kpi, i) => (
          <div key={i} className="terminal-metric">
            <div className="terminal-metric-label">{kpi.label}</div>
            <div className="terminal-metric-value" style={{ color: kpi.color }}>
              <CountUp value={typeof kpi.value === 'string' ? kpi.value.replace(/[^0-9.]/g, '') : kpi.value}
                prefix={typeof kpi.value === 'string' && kpi.value.startsWith('$') ? '$' : ''}
                suffix={kpi.suffix || ''}
                decimals={typeof kpi.decimals === 'number' ? kpi.decimals : (typeof kpi.value === 'string' && kpi.value.includes('.') ? 2 : 0)}
              />
            </div>
            <div className="terminal-metric-sub">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="terminal-split terminal-split--triple" style={{ marginBottom: 16 }}>
        <div className="lane">
          <div className="lane-head">
            <div className="lane-title">On-chain flow</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.55rem', color: 'var(--text3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: 14, height: 8,
                  background: 'linear-gradient(180deg, rgba(91,108,255,0.7), rgba(91,108,255,0.1))',
                  clipPath: 'polygon(0% 100%, 15% 35%, 50% 0%, 85% 35%, 100% 100%)',
                }} /> ETH VOLUME
              </span>
              <span style={{ fontSize: '0.55rem', color: 'var(--text3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: 10, height: 8,
                  background: 'linear-gradient(180deg, rgba(61,188,245,0.55), rgba(61,188,245,0.08))',
                  clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
                }} /> BY AGENT
              </span>
              <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: 'currentColor',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
                LIVE
              </span>
            </div>
          </div>
          <div className="lane-body">
            {agentFlowChart.length === 0 ? (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '0.78rem' }}>
                No real on-chain trades yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={agentFlowChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mountainVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5B6CFF" stopOpacity={0.55} />
                      <stop offset="45%" stopColor="#9A7DFF" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#5B6CFF" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="mountainBuys" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3DBCF5" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#3DBCF5" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="mountainStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#5B6CFF" />
                      <stop offset="100%" stopColor="#3DBCF5" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 8" vertical={false} stroke="#E4E7EF" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: '#8B93A7' }}
                    axisLine={{ stroke: '#E4E7EF' }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: '#8B93A7' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v) => (v >= 1 ? v.toFixed(2) : v.toFixed(3))}
                  />
                  <Tooltip
                    cursor={{ stroke: '#5B6CFF', strokeWidth: 1, strokeDasharray: '4 4' }}
                    contentStyle={{
                      background: '#FFFFFF',
                      border: '1px solid #E4E7EF',
                      borderRadius: 0,
                      fontSize: '0.72rem',
                      boxShadow: '0 10px 40px rgba(28,39,76,0.08)',
                    }}
                    formatter={(v, name) => {
                      const n = Number(v) || 0
                      if (name === 'eth') return [`${n.toFixed(5)} ETH`, 'Total volume']
                      if (name === 'buys') return [`${n.toFixed(5)} ETH`, 'Buy volume']
                      return [`${n.toFixed(5)} ETH`, name]
                    }}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload
                      if (!p?.ticker) return '—'
                      return `$${p.ticker} · ${p.trades || 0} trades`
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="eth"
                    name="eth"
                    stroke="url(#mountainStroke)"
                    strokeWidth={2.5}
                    fill="url(#mountainVolume)"
                    fillOpacity={1}
                    dot={(props) => {
                      const { cx, cy, payload } = props
                      if (!payload?.ticker || cx == null || cy == null) return null
                      return (
                        <circle
                          key={`dot-${payload.ticker}`}
                          cx={cx}
                          cy={cy}
                          r={3.5}
                          fill="#5B6CFF"
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      )
                    }}
                    activeDot={{ r: 5, fill: '#5B6CFF', stroke: '#fff', strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="buys"
                    name="buys"
                    stroke="#3DBCF5"
                    strokeWidth={1.25}
                    fill="url(#mountainBuys)"
                    fillOpacity={1}
                    dot={false}
                    activeDot={{ r: 3, fill: '#3DBCF5', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lane">
          <div className="lane-head">
            <div className="lane-title">Most active traders</div>
            <span className="badge badge-gray">TOP 5</span>
          </div>
          <div className="lane-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {(() => {
              const mostActive = [...agents]
                .sort((a, b) => (tradeCounts[b.ticker] || 0) - (tradeCounts[a.ticker] || 0))
                .slice(0, 5)
              if (mostActive.length === 0) {
                return <div style={{ padding: 12, textAlign: 'center', color: 'var(--text3)', fontSize: '0.72rem' }}>No real trades yet</div>
              }
              const maxTrades = Math.max(...mostActive.map(a => tradeCounts[a.ticker] || 0), 1)
              return mostActive.map((a, i) => {
                const trades = tradeCounts[a.ticker] || 0
                const pct = Math.max(4, (trades / maxTrades) * 100)
                return (
                  <div key={a.ticker} className="desk-rank-row">
                    <div className="desk-rank-row-main">
                      <span className="desk-rank-pos" style={{ color: i === 0 ? '#5B6CFF' : i === 1 ? '#9A7DFF' : i === 2 ? '#3DBCF5' : 'var(--text3)' }}>
                        #{i + 1}
                      </span>
                      <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="xs" />
                      <span className="desk-rank-ticker">{a.ticker}</span>
                      <span className="desk-rank-value" style={{ color: 'var(--blue)' }}>{trades} trades</span>
                    </div>
                    <div className="desk-rank-bar">
                      <div style={{
                        width: `${pct}%`,
                        background: i === 0 ? '#5B6CFF' : i === 1 ? '#9A7DFF' : i === 2 ? '#3DBCF5' : '#D0D5E2',
                      }} />
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>

        <div className="lane">
          <div className="lane-head">
            <div className="lane-title">Top portfolios</div>
          </div>
          <div className="lane-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {[...agents].sort((a, b) => portfolioUsd(b) - portfolioUsd(a)).slice(0, 5).map((a, i) => {
              const maxVal = portfolioUsd(leader || a) || 1
              const pct = Math.max(4, (portfolioUsd(a) / maxVal) * 100)
              return (
                <div key={a.ticker} className="desk-rank-row">
                  <div className="desk-rank-row-main">
                    <span className="desk-rank-pos" style={{ color: i === 0 ? '#5B6CFF' : i === 1 ? '#9A7DFF' : i === 2 ? '#3DBCF5' : 'var(--text3)' }}>
                      #{i + 1}
                    </span>
                    <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="xs" />
                    <span className="desk-rank-ticker">{a.ticker}</span>
                    <span className="desk-rank-value">${portfolioUsd(a).toFixed(2)}</span>
                  </div>
                  <div className="desk-rank-bar">
                    <div style={{
                      width: `${pct}%`,
                      background: i === 0 ? '#5B6CFF' : i === 1 ? '#9A7DFF' : i === 2 ? '#3DBCF5' : '#D0D5E2',
                    }} />
                  </div>
                </div>
              )
            })}
            {agents.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text3)', fontSize: '0.72rem' }}>No agents yet</div>
            )}
          </div>
        </div>
      </div>

      {/* All Agents Table */}
      {(() => {
        const visible = agents
        if (visible.length === 0) return null
        const agentsTotalPages = Math.max(1, Math.ceil(visible.length / AGENTS_PAGE_SIZE))
        const agentsPageClamped = Math.min(agentsPage, agentsTotalPages)
        const paginatedAgents = visible.slice(
          (agentsPageClamped - 1) * AGENTS_PAGE_SIZE,
          agentsPageClamped * AGENTS_PAGE_SIZE
        )
        return (
          <div className="lane">
            <div className="lane-head">
              <div className="lane-title">All agents</div>
              <span className="badge badge-green">{visible.length}</span>
            </div>
            <div className="lane-body" style={{ overflowX: 'auto' }}>
              <table className="data-table desk-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Ticker</th><th>Full Name</th>
                    <th style={{ textAlign: 'right' }}>Portfolio</th>
                    <th style={{ textAlign: 'right' }}>ETH Balance</th>
                    <th style={{ textAlign: 'right' }}>Invested</th>
                    <th>Tokens</th>
                    <th style={{ textAlign: 'right' }}>Trades</th>
                    <th>Creator</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAgents.map(a => {
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
              {agentsTotalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setAgentsPage(p => Math.max(1, p - 1))}
                    disabled={agentsPageClamped <= 1}
                    className="desk-chip"
                    style={{ opacity: agentsPageClamped <= 1 ? 0.4 : 1, cursor: agentsPageClamped <= 1 ? 'not-allowed' : 'pointer' }}
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Tinos', serif" }}>
                    Page {agentsPageClamped} of {agentsTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAgentsPage(p => Math.min(agentsTotalPages, p + 1))}
                    disabled={agentsPageClamped >= agentsTotalPages}
                    className="desk-chip"
                    style={{ opacity: agentsPageClamped >= agentsTotalPages ? 0.4 : 1, cursor: agentsPageClamped >= agentsTotalPages ? 'not-allowed' : 'pointer' }}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <div className="lane">
        <div className="lane-head">
          <div className="lane-title">Recent activity</div>
          <span className="badge badge-red">STREAMING</span>
        </div>
        <div className="lane-body stream">
          {activity.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: '0.8rem' }}>
              No real on-chain activity yet.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {paginatedActivity.map((item, i) => {
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
                  borderBottom: i < paginatedActivity.length - 1 ? '1px solid var(--border)' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      background: (AGENT_COLORS[item.agent_ticker] || agentColor(item.agent_ticker || '')) + '20',
                      color: AGENT_COLORS[item.agent_ticker] || agentColor(item.agent_ticker || ''),
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      fontFamily: "'Tinos', serif"
                    }}>
                      {item.agent_ticker}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{item.action}</span>
                    {item.tx_hash && (
                      <a href={explorerTx(item.tx_hash)} target="_blank" rel="noopener noreferrer"
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
                {holdingsModalAgent.ticker} — Token Holdings
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
                          <a href={explorerToken(address)} target="_blank" rel="noopener noreferrer"
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