import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'
import { asArray } from '../lib/api'
import { explorerTx, explorerToken } from '../lib/chains'
import { API_BASE as API } from '../lib/config'

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

const AGENT_COLORS = {
  RAVI: '#18B368', ZEUS: '#FFB547',
  NOVA: '#9A7DFF', BRAHMA: '#5B6CFF', KIRA: '#FF5A70'
}

function agentColor(ticker) {
  const presets = { RAVI: '#18B368', ZEUS: '#FFB547', NOVA: '#9A7DFF', BRAHMA: '#5B6CFF', KIRA: '#FF5A70' }
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
  const [coinsPage, setCoinsPage] = useState(1)

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

  // Reset coins pagination when switching agents
  useEffect(() => { setCoinsPage(1) }, [selected])

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
  const accent = agent ? (AGENT_COLORS[agent.ticker] || agentColor(agent.ticker)) : '#5B6CFF'

  return (
    <div className="fade-in desk">
      <style>{`
        @media (max-width: 640px) {
          .profile-hero-inner { flex-direction: column !important; align-items: flex-start !important; }
          .profile-hero-price { text-align: left !important; }
          .profile-metrics { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div className="terminal-bar">
        <div>
          <div className="terminal-bar-title">Agent Profiles</div>
          <div className="terminal-bar-sub">Detailed statistics for each autonomous agent</div>
        </div>
      </div>

      <ScrollReveal delay={0}>
        <div className="lane">
          <div className="lane-head">
            <div className="lane-title">Select Agent</div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>
              {filteredSorted.length} agent{filteredSorted.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="lane-body">
            <div className="desk-toolbar">
              <div className="desk-search">
                <Search size={14} color="var(--text3)" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search agents by ticker or name..."
                />
              </div>
              <select
                className="desk-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="chip-row" style={{ marginTop: 10 }}>
              {paginated.length === 0 && (
                <div style={{ color: 'var(--text3)', fontSize: '0.78rem', padding: '8px 0' }}>
                  No agents match "{search}"
                </div>
              )}
              {paginated.map(a => (
                <button
                  key={a.ticker}
                  type="button"
                  className={`desk-chip ${selected === a.ticker ? 'desk-chip--active' : ''}`}
                  onClick={() => setSelected(a.ticker)}
                  style={selected === a.ticker ? {
                    borderColor: AGENT_COLORS[a.ticker] || agentColor(a.ticker),
                    color: AGENT_COLORS[a.ticker] || agentColor(a.ticker),
                  } : undefined}
                >
                  {a.ticker}
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '14px' }}>
                <button
                  type="button"
                  className="desk-chip"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={pageClamped <= 1}
                  style={{ opacity: pageClamped <= 1 ? 0.4 : 1, cursor: pageClamped <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Tinos', serif" }}>
                  Page {pageClamped} of {totalPages}
                </span>
                <button
                  type="button"
                  className="desk-chip"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={pageClamped >= totalPages}
                  style={{ opacity: pageClamped >= totalPages ? 0.4 : 1, cursor: pageClamped >= totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </ScrollReveal>

      {agent && (
        <div>

          <ScrollReveal delay={50}>
            <div className="lane">
              <div className="lane-body">
                <div className="terminal-split">
                  <div className="profile-hero-inner" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <AgentAvatar ticker={agent.ticker} avatarUrl={agent.avatar_url} size="xl" />
                    <div>
                      <div style={{ fontFamily: "'Tinos', serif", fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)' }}>
                        {agent.full_name}
                      </div>
                      <span className="badge badge-green" style={{ marginTop: '8px', display: 'inline-block' }}>
                        ${agent.ticker}
                      </span>
                    </div>
                  </div>
                  <div className="inspector profile-hero-price">
                    <div className="inspector-label">Portfolio Value</div>
                    <div className="inspector-value" style={{ color: accent }}>
                      ${portfolioUsd(agent).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text2)' }}>
                      {parseFloat(agent.real_eth || 0).toFixed(5)} ETH on Robinhood Chain
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div className="terminal-metrics profile-metrics" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
              {[
                { label: 'Wallet (USD)',     num: parseFloat(agent.real_usd || 0),     prefix: '$', suffix: '',     decimals: 2, sub: `${parseFloat(agent.real_eth || 0).toFixed(5)} ETH on Robinhood Chain`, color: 'var(--blue)' },
                { label: 'Portfolio Value',  num: portfolioUsd(agent),                 prefix: '$', suffix: '',     decimals: 2, sub: 'ETH + token positions',                                    color: 'var(--green)' },
                { label: 'Tokens Held',      num: tokensHeldCount(agent),              prefix: '',  suffix: '',     decimals: 0, sub: 'on-chain positions',                                       color: 'var(--gold)' },
                { label: 'Real Trades',      num: tradeCounts[agent.ticker] || 0,      prefix: '',  suffix: '',     decimals: 0, sub: 'ETH ↔ token swaps',                                        color: 'var(--purple)' },
                { label: 'Invested',         num: tokenInvestedEth(agent),             prefix: '',  suffix: ' ETH', decimals: 5, sub: 'cost basis in tokens',                                     color: 'var(--blue)' },
              ].map((s, i) => (
                <div key={i} className="terminal-metric">
                  <div className="terminal-metric-label">{s.label}</div>
                  <div className="terminal-metric-value" style={{ color: s.color }}>
                    <CountUp value={s.num} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals} />
                  </div>
                  <div className="terminal-metric-sub">{s.sub}</div>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal delay={150}>
            <div className="terminal-split" style={{ marginBottom: 16 }}>
              <div className="lane">
                <div className="lane-head">
                  <div className="lane-title">Coins Traded</div>
                  <span className="badge badge-green">ON-CHAIN</span>
                </div>
                <div className="lane-body">
                  {(() => {
                    const COINS_PAGE_SIZE = 5
                    const th = agent.token_holdings && typeof agent.token_holdings === 'object' ? agent.token_holdings : {}
                    const holdingEntries = Object.entries(th).filter(([, v]) => v && parseFloat(v.amount) > 0)
                    const trades = [...(tokenTrades[agent.ticker] || [])].sort(
                      (a, b) => new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0)
                    )

                    if (holdingEntries.length === 0 && trades.length === 0) {
                      return (
                        <div style={{ color: 'var(--text3)', fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>
                          No real coins traded yet
                        </div>
                      )
                    }

                    const coinsTotalPages = Math.max(1, Math.ceil(trades.length / COINS_PAGE_SIZE))
                    const coinsPageClamped = Math.min(coinsPage, coinsTotalPages)
                    const pagedTrades = trades.slice(
                      (coinsPageClamped - 1) * COINS_PAGE_SIZE,
                      coinsPageClamped * COINS_PAGE_SIZE
                    )

                    return (
                      <>
                        {holdingEntries.length > 0 && (
                          <>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>CURRENTLY HOLDING</div>
                            <div className="chip-row" style={{ marginBottom: trades.length ? '14px' : 0 }}>
                              {holdingEntries.map(([addr, v]) => (
                                <a key={addr} href={explorerToken(addr)} target="_blank" rel="noopener noreferrer"
                                  className="desk-chip"
                                  style={{ textDecoration: 'none' }}>
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
                            <div className="stream">
                              {pagedTrades.map(t => (
                                <a key={t.id} href={t.tx_hash ? explorerTx(t.tx_hash) : undefined}
                                  target="_blank" rel="noopener noreferrer"
                                  className="stream-item"
                                  style={{ textDecoration: 'none', color: 'inherit' }}>
                                  <span className="stream-mark" style={{
                                    background: t.side === 'buy' ? '#E8F8F0' : '#FFECEF',
                                    color: t.side === 'buy' ? 'var(--green)' : 'var(--red)',
                                    fontSize: '0.55rem',
                                  }}>
                                    {(t.side || '').toUpperCase().slice(0, 1)}
                                  </span>
                                  <div className="stream-main">
                                    <div className="stream-title">${t.token_symbol || '???'}</div>
                                    <div className="stream-meta">{(t.side || '').toUpperCase()}</div>
                                  </div>
                                  <div className="stream-side" style={{ color: 'var(--text3)' }}>
                                    {parseFloat(t.eth_amount || 0).toFixed(5)} ETH
                                  </div>
                                </a>
                              ))}
                            </div>

                            {coinsTotalPages > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '14px' }}>
                                <button
                                  type="button"
                                  className="desk-chip"
                                  onClick={() => setCoinsPage(p => Math.max(1, p - 1))}
                                  disabled={coinsPageClamped <= 1}
                                  style={{ opacity: coinsPageClamped <= 1 ? 0.4 : 1, cursor: coinsPageClamped <= 1 ? 'not-allowed' : 'pointer' }}
                                >
                                  <ChevronLeft size={14} /> Prev
                                </button>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Tinos', serif" }}>
                                  Page {coinsPageClamped} of {coinsTotalPages}
                                </span>
                                <button
                                  type="button"
                                  className="desk-chip"
                                  onClick={() => setCoinsPage(p => Math.min(coinsTotalPages, p + 1))}
                                  disabled={coinsPageClamped >= coinsTotalPages}
                                  style={{ opacity: coinsPageClamped >= coinsTotalPages ? 0.4 : 1, cursor: coinsPageClamped >= coinsTotalPages ? 'not-allowed' : 'pointer' }}
                                >
                                  Next <ChevronRight size={14} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>

              <div className="lane">
                <div className="lane-head">
                  <div className="lane-title">Trading Activity</div>
                  <span className="badge badge-green">ON-CHAIN</span>
                </div>
                <div className="lane-body">
                  {(() => {
                    const buyCount = agentTrades.filter(t => t.side === 'buy').length
                    const sellCount = agentTrades.filter(t => t.side === 'sell').length
                    const total = agentTrades.length
                    const ethVolume = agentTrades.reduce((s, t) => s + parseFloat(t.eth_amount || 0), 0)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[
                          { label: 'Buy Orders',       value: `${buyCount}`,                  pct: total ? (buyCount / total) * 100 : 0,        color: 'var(--green)' },
                          { label: 'Sell Orders',      value: `${sellCount}`,                 pct: total ? (sellCount / total) * 100 : 0,       color: 'var(--red)' },
                          { label: 'Total ETH Traded', value: `${ethVolume.toFixed(5)} ETH`,  pct: Math.min((ethVolume / 0.01) * 100, 100),     color: 'var(--blue)' },
                        ].map((m, i) => (
                          <AnimatedBar key={`${agent.ticker}-${i}`} label={m.label} value={m.value} pct={m.pct} color={m.color} delay={i * 150} />
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className="lane">
              <div className="lane-head">
                <div className="lane-title">Recent Trade Volume</div>
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
                    }} /> BUYS
                  </span>
                  <span className="badge badge-gray">{agentTrades.length} trades</span>
                </div>
              </div>
              <div className="lane-body">
                {(() => {
                  const peaks = [...agentTrades]
                    .slice(0, 20)
                    .reverse()
                    .map((t, i) => {
                      const eth = parseFloat(t.eth_amount || 0)
                      const side = (t.side || '').toLowerCase()
                      return {
                        label: t.token_symbol || `${i + 1}`,
                        ticker: t.token_symbol || '',
                        eth: Number(eth.toFixed(6)),
                        buys: side === 'buy' ? Number(eth.toFixed(6)) : 0,
                        side,
                        symbol: t.token_symbol || '',
                      }
                    })

                  if (peaks.length === 0) {
                    return (
                      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '0.78rem' }}>
                        No on-chain trades yet
                      </div>
                    )
                  }

                  const chartData = [
                    { label: '', ticker: '', eth: 0, buys: 0, side: '', symbol: '' },
                    ...peaks,
                    { label: '', ticker: '', eth: 0, buys: 0, side: '', symbol: '' },
                  ]
                  const gradId = `agentMountain-${agent.ticker}`

                  return (
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`${gradId}-volume`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5B6CFF" stopOpacity={0.55} />
                            <stop offset="45%" stopColor="#9A7DFF" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#5B6CFF" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id={`${gradId}-buys`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3DBCF5" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#3DBCF5" stopOpacity={0.04} />
                          </linearGradient>
                          <linearGradient id={`${gradId}-stroke`} x1="0" y1="0" x2="1" y2="0">
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
                          interval="preserveStartEnd"
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
                            if (name === 'eth') return [`${n.toFixed(5)} ETH`, 'Trade size']
                            if (name === 'buys') return [`${n.toFixed(5)} ETH`, 'Buy']
                            return [`${n.toFixed(5)} ETH`, name]
                          }}
                          labelFormatter={(_, payload) => {
                            const p = payload?.[0]?.payload
                            if (!p?.symbol && !p?.side) return '—'
                            return `$${(p.symbol || '').toUpperCase()} · ${(p.side || '').toUpperCase() || 'TRADE'}`
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="eth"
                          name="eth"
                          stroke={`url(#${gradId}-stroke)`}
                          strokeWidth={2.5}
                          fill={`url(#${gradId}-volume)`}
                          fillOpacity={1}
                          dot={(props) => {
                            const { cx, cy, payload } = props
                            if (!payload?.symbol || cx == null || cy == null) return null
                            return (
                              <circle
                                key={`dot-${payload.symbol}-${cx}`}
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
                          fill={`url(#${gradId}-buys)`}
                          fillOpacity={1}
                          dot={false}
                          activeDot={{ r: 3, fill: '#3DBCF5', stroke: '#fff', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )
                })()}
              </div>
            </div>
          </ScrollReveal>

        </div>
      )}
    </div>
  )
}
