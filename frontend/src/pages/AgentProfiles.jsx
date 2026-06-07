import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { TrendingUp, Coins, Wallet, Repeat, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'
import { asArray } from '../lib/api'

// Sum of ETH cost basis invested across an agent's real token holdings.
function tokenInvestedEth(agent) {
  const h = agent?.token_holdings
  if (!h || typeof h !== 'object') return 0
  return Object.values(h).reduce((s, t) => s + parseFloat(t?.eth_in || 0), 0)
}

// Number of distinct real token positions currently held.
function tokensHeldCount(agent) {
  const h = agent?.token_holdings
  if (!h || typeof h !== 'object') return 0
  return Object.values(h).filter((t) => t && parseFloat(t.amount) > 0).length
}

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

function AnimatedBar({ label, value, pct, color, delay = 0 }) {
  const [width, setWidth] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setTimeout(() => setWidth(pct), delay)
        observer.disconnect()
      }
    }, { threshold: 0.3 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [pct, delay])

  return (
    <div ref={ref}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{label}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color }}>{value}</span>
      </div>
      <div className="progress-bar" style={{ height: '6px' }}>
        <div className="progress-fill" style={{
          width: `${width}%`,
          background: color,
          transition: `width 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`
        }} />
      </div>
    </div>
  )
}

const PAGE_SIZE = 24

const SORT_OPTIONS = [
  { value: 'value_desc', label: 'Portfolio Value: High → Low' },
  { value: 'value_asc', label: 'Portfolio Value: Low → High' },
  { value: 'eth_desc', label: 'ETH Balance: High → Low' },
  { value: 'trades_desc', label: 'Most Real Trades' },
  { value: 'ticker_asc', label: 'Ticker: A → Z' },
]

export default function AgentProfiles() {
  const [agents, setAgents] = useState([])
  const [tradeCounts, setTradeCounts] = useState({})
  const [tokenTrades, setTokenTrades] = useState({})
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('value_desc')
  const [page, setPage] = useState(1)

  const fetchAgents = () => {
    Promise.all([
      axios.get(`${API}/api/agents`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/token-trades?limit=1000`).catch(() => ({ data: [] })),
    ]).then(([a, tt]) => {
      const data = asArray(a.data)
      setAgents(data)
      setSelected(prev => prev ?? data[0]?.ticker)
      const counts = {}
      asArray(tt.data).forEach((t) => {
        if (t.agent_ticker) counts[t.agent_ticker] = (counts[t.agent_ticker] || 0) + 1
      })
      setTradeCounts(counts)
    }).catch(() => setAgents([]))
  }

  useEffect(() => { fetchAgents() }, [])
  usePageFocus(fetchAgents)

  useEffect(() => {
    const interval = setInterval(fetchAgents, 15000)
    return () => clearInterval(interval)
  }, [])

  // Lazily load real on-chain token trades for the selected agent
  useEffect(() => {
    if (!selected) return
    axios.get(`${API}/api/agents/${selected}/token-trades`)
      .then(r => setTokenTrades(t => ({ ...t, [selected]: asArray(r.data) })))
      .catch(() => setTokenTrades(t => ({ ...t, [selected]: [] })))
  }, [selected])

  // Reset to first page when search/sort changes
  useEffect(() => { setPage(1) }, [search, sortBy])

  // Live ETH/USD derived from any funded agent (real_usd / real_eth).
  const ethUsd = (() => {
    const ref = agents.find(a => parseFloat(a.real_eth || 0) > 0 && parseFloat(a.real_usd || 0) > 0)
    return ref ? parseFloat(ref.real_usd) / parseFloat(ref.real_eth) : 0
  })()

  // Real portfolio value (USD): on-chain ETH + token cost basis at live ETH price.
  const portfolioUsd = (a) => parseFloat(a.real_usd || 0) + tokenInvestedEth(a) * ethUsd

  const filteredSorted = (() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? agents.filter(a =>
          a.ticker.toLowerCase().includes(q) ||
          (a.full_name || '').toLowerCase().includes(q))
      : agents
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'value_asc': return portfolioUsd(a) - portfolioUsd(b)
        case 'eth_desc': return parseFloat(b.real_eth || 0) - parseFloat(a.real_eth || 0)
        case 'trades_desc': return (tradeCounts[b.ticker] || 0) - (tradeCounts[a.ticker] || 0)
        case 'ticker_asc': return a.ticker.localeCompare(b.ticker)
        case 'value_desc':
        default: return portfolioUsd(b) - portfolioUsd(a)
      }
    })
  })()

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const paginated = filteredSorted.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE)

  const agent = agents.find(a => a.ticker === selected)
  const agentTrades = (selected && tokenTrades[selected]) || []

  return (
    <div className="fade-in">
      <style>{`
        @media (max-width: 640px) {
          .profile-hero-inner { flex-direction: column !important; align-items: flex-start !important; }
          .profile-hero-price { text-align: left !important; }
          .profile-top-grid { grid-template-columns: 1fr !important; }
          .profile-bottom-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="page-header">
        <div className="page-title">Agent Profiles</div>
        <div className="page-subtitle">Detailed statistics for each autonomous agent</div>
      </div>

      <ScrollReveal delay={0}>
        <div style={{ marginBottom: '20px' }}>
          {/* Search + Sort controls */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search agents by ticker or name..."
                style={{
                  width: '100%', padding: '8px 12px 8px 32px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)',
                  fontFamily: "'Geist Mono', monospace", fontSize: '0.78rem', outline: 'none',
                }}
              />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'var(--bg2)', color: 'var(--text)', fontFamily: "'Geist Mono', monospace",
                fontSize: '0.78rem', cursor: 'pointer', outline: 'none',
              }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {filteredSorted.length} agent{filteredSorted.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Agent buttons (paginated) */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {paginated.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: '0.78rem', padding: '8px 0' }}>
                No agents match "{search}"
              </div>
            )}
            {paginated.map(a => (
              <button key={a.ticker} onClick={() => setSelected(a.ticker)} style={{
                background: selected === a.ticker ? (AGENT_COLORS[a.ticker] || agentColor(a.ticker)) : 'var(--bg2)',
                color: selected === a.ticker ? '#fff' : 'var(--text)',
                border: `1px solid ${selected === a.ticker ? (AGENT_COLORS[a.ticker] || agentColor(a.ticker)) : 'var(--text3)'}`,
                boxShadow: selected === a.ticker ? `0 0 12px ${(AGENT_COLORS[a.ticker] || agentColor(a.ticker))}55` : 'none',
                padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
                fontFamily: "'Geist Mono', monospace", fontWeight: 700, fontSize: '0.8rem', transition: 'all 0.2s'
              }}>
                {a.ticker}
              </button>
            ))}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '14px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pageClamped <= 1}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)',
                  fontSize: '0.72rem', cursor: pageClamped <= 1 ? 'not-allowed' : 'pointer',
                  opacity: pageClamped <= 1 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Geist Mono', monospace" }}>
                Page {pageClamped} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageClamped >= totalPages}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)',
                  fontSize: '0.72rem', cursor: pageClamped >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: pageClamped >= totalPages ? 0.4 : 1,
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </ScrollReveal>

      {agent && (
        <div>

          {/* Profile Hero */}
          <ScrollReveal delay={50}>
            <div className="card" style={{
              background: `linear-gradient(135deg, var(--bg2) 0%, ${(AGENT_COLORS[agent.ticker] || agentColor(agent.ticker))}15 100%)`,
              border: `1px solid ${(AGENT_COLORS[agent.ticker] || agentColor(agent.ticker))}30`,
              marginBottom: '16px'
            }}>
              <div className="profile-hero-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <AgentAvatar ticker={agent.ticker} avatarUrl={agent.avatar_url} size="xl" />
                  <div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)' }}>
                      {agent.full_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '2px' }}>{agent.style}</div>
                  </div>
                </div>
                <div className="profile-hero-price" style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.52rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>
                    Portfolio Value
                  </div>
                  <div style={{
                    fontFamily: "'Syne', sans-serif", fontSize: '2.2rem', fontWeight: 800,
                    color: (AGENT_COLORS[agent.ticker] || agentColor(agent.ticker))
                  }}>
                    ${portfolioUsd(agent).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text2)' }}>
                    {parseFloat(agent.real_eth || 0).toFixed(5)} ETH on Base
                  </div>
                  <span className="badge badge-green" style={{ marginTop: '8px', display: 'inline-block' }}>
                    {agent.status}
                  </span>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* ROW 1: Stats (left) + Holdings (right) */}
          <ScrollReveal delay={100}>
            <div className="profile-top-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>

              {/* Left: Stats grid (real on-chain) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', alignContent: 'start' }}>
                {[
                  { label: 'Wallet (USD)',     num: parseFloat(agent.real_usd || 0),     prefix: '$', suffix: '',     decimals: 2, sub: `${parseFloat(agent.real_eth || 0).toFixed(5)} ETH on Base`, icon: Wallet,     color: 'var(--blue)',  bg: '#eff4ff' },
                  { label: 'Portfolio Value',  num: portfolioUsd(agent),                 prefix: '$', suffix: '',     decimals: 2, sub: 'ETH + token positions',                                    icon: TrendingUp, color: 'var(--green)', bg: '#edfaf4' },
                  { label: 'Tokens Held',      num: tokensHeldCount(agent),              prefix: '',  suffix: '',     decimals: 0, sub: 'on-chain positions',                                       icon: Coins,      color: 'var(--gold)',  bg: '#fff8ed' },
                  { label: 'Real Trades',      num: tradeCounts[agent.ticker] || 0,      prefix: '',  suffix: '',     decimals: 0, sub: 'ETH ↔ token swaps',                                        icon: Repeat,     color: 'var(--purple)',bg: '#f5f0ff' },
                  { label: 'Invested',         num: tokenInvestedEth(agent),             prefix: '',  suffix: ' ETH', decimals: 5, sub: 'cost basis in tokens',                                     icon: Coins,      color: 'var(--blue)',  bg: '#eff4ff' },
                ].map((s, i) => (
                  <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px' }}>
                    <div>
                      <div style={{ fontSize: '0.52rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif", marginBottom: '2px' }}>
                        <CountUp value={s.num} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals} />
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>{s.sub}</div>
                    </div>
                    <div style={{ background: s.bg, padding: '6px', borderRadius: '6px', flexShrink: 0 }}>
                      <s.icon size={12} color={s.color} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Real on-chain coins traded on Base */}
              <div>
                {(() => {
                  const th = agent.token_holdings && typeof agent.token_holdings === 'object' ? agent.token_holdings : {}
                  const holdingEntries = Object.entries(th).filter(([, v]) => v && parseFloat(v.amount) > 0)
                  const trades = (tokenTrades[agent.ticker] || []).slice(0, 8)

                  if (holdingEntries.length === 0 && trades.length === 0) {
                    return (
                      <div className="card" style={{ color: 'var(--text3)', fontSize: '0.78rem', textAlign: 'center', padding: '24px' }}>
                        No real coins traded yet
                      </div>
                    )
                  }

                  return (
                    <div className="card">
                      <div className="card-header">
                        <div className="card-title">Coins Traded (Base)</div>
                        <span className="badge badge-green">ON-CHAIN</span>
                      </div>

                      {holdingEntries.length > 0 && (
                        <>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>CURRENTLY HOLDING</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: trades.length ? '14px' : 0 }}>
                            {holdingEntries.map(([addr, v]) => (
                              <a key={addr} href={`https://basescan.org/token/${addr}`} target="_blank" rel="noopener noreferrer"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '6px',
                                  padding: '6px 10px', background: 'var(--bg3)', borderRadius: '8px',
                                  border: '1px solid var(--border)', textDecoration: 'none'
                                }}>
                                <span style={{ fontWeight: 700, color: 'var(--green)' }}>${v.symbol || '???'}</span>
                                <span style={{ color: 'var(--text2)', fontSize: '0.8rem' }}>
                                  {parseFloat(v.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                  <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>{parseFloat(v.eth_in || 0).toFixed(5)} ETH in</span>
                                </span>
                              </a>
                            ))}
                          </div>
                        </>
                      )}

                      {trades.length > 0 && (
                        <>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>RECENT TRADES</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {trades.map(t => (
                              <a key={t.id} href={t.tx_hash ? `https://basescan.org/tx/${t.tx_hash}` : undefined}
                                target="_blank" rel="noopener noreferrer"
                                style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '5px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none'
                                }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{
                                    fontSize: '0.55rem', fontWeight: 800, padding: '1px 6px', borderRadius: '4px',
                                    background: t.side === 'buy' ? '#edfaf4' : '#fff0f3',
                                    color: t.side === 'buy' ? 'var(--green)' : 'var(--red)'
                                  }}>{(t.side || '').toUpperCase()}</span>
                                  <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>${t.token_symbol || '???'}</span>
                                </span>
                                <span style={{ color: 'var(--text3)', fontSize: '0.68rem' }}>
                                  {parseFloat(t.eth_amount || 0).toFixed(5)} ETH
                                </span>
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>

            </div>
          </ScrollReveal>

          {/* ROW 2: Trading Activity (left) + Recent Trade Volume (right) */}
          <ScrollReveal delay={200}>
            {(() => {
              const buyCount = agentTrades.filter(t => t.side === 'buy').length
              const sellCount = agentTrades.filter(t => t.side === 'sell').length
              const total = agentTrades.length
              const ethVolume = agentTrades.reduce((s, t) => s + parseFloat(t.eth_amount || 0), 0)
              // Oldest → newest, last 20, for the volume chart.
              const chartData = [...agentTrades]
                .slice(0, 20)
                .reverse()
                .map((t, i) => ({ n: i + 1, eth: parseFloat(t.eth_amount || 0), side: t.side, symbol: t.token_symbol }))

              return (
                <div className="profile-bottom-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>

                  {/* Left: Trading Activity */}
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Trading Activity</div>
                      <span className="badge badge-green">ON-CHAIN</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {[
                        { label: 'Buy Orders',       value: `${buyCount}`,                  pct: total ? (buyCount / total) * 100 : 0,        color: 'var(--green)' },
                        { label: 'Sell Orders',      value: `${sellCount}`,                 pct: total ? (sellCount / total) * 100 : 0,       color: 'var(--red)' },
                        { label: 'Total ETH Traded', value: `${ethVolume.toFixed(5)} ETH`,  pct: Math.min((ethVolume / 0.01) * 100, 100),     color: 'var(--blue)' },
                      ].map((m, i) => (
                        <AnimatedBar key={`${agent.ticker}-${i}`} label={m.label} value={m.value} pct={m.pct} color={m.color} delay={i * 150} />
                      ))}
                    </div>
                  </div>

                  {/* Right: Recent Trade Volume (ETH per trade, buy=green / sell=red) */}
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Recent Trade Volume</div>
                      <span className="badge badge-gray">{total} trades</span>
                    </div>
                    {chartData.length === 0 ? (
                      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '0.78rem' }}>
                        No on-chain trades yet
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={chartData}>
                          <XAxis dataKey="n" tick={{ fontSize: 9, fill: '#8896a8' }} />
                          <YAxis tick={{ fontSize: 9, fill: '#8896a8' }} domain={['auto', 'auto']} />
                          <Tooltip
                            contentStyle={{ background: '#0d1117', border: '1px solid #1e2730', borderRadius: '8px', fontSize: '0.7rem' }}
                            formatter={(v, _n, p) => [`${parseFloat(v).toFixed(6)} ETH`, `${(p?.payload?.side || '').toUpperCase()} $${p?.payload?.symbol || ''}`]}
                          />
                          <Bar dataKey="eth" radius={[3, 3, 0, 0]}>
                            {chartData.map((d, i) => (
                              <Cell key={i} fill={d.side === 'buy' ? '#00b87a' : '#f03358'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                </div>
              )
            })()}
          </ScrollReveal>

        </div>
      )}
    </div>
  )
}