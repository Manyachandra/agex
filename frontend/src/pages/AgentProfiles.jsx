import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingUp, TrendingDown, Zap, Wallet, Target, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'
import { asArray } from '../lib/api'

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
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'ticker_asc', label: 'Ticker: A → Z' },
  { value: 'tasks_desc', label: 'Tasks Won' },
  { value: 'wallet_desc', label: 'Wallet: High → Low' },
]

export default function AgentProfiles() {
  const [agents, setAgents] = useState([])
  const [histories, setHistories] = useState({})
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('price_desc')
  const [page, setPage] = useState(1)

  const fetchAgents = () => {
    axios.get(`${API}/api/agents`).then(r => {
      const data = asArray(r.data)
      setAgents(data)
      setSelected(prev => prev ?? data[0]?.ticker)
    }).catch(() => setAgents([]))
  }

  useEffect(() => { fetchAgents() }, [])
  usePageFocus(fetchAgents)

  useEffect(() => {
    const interval = setInterval(() => {
      axios.get(`${API}/api/agents`).then(r => setAgents(asArray(r.data))).catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Lazily load price history only for the selected agent
  useEffect(() => {
    if (!selected || histories[selected]) return
    axios.get(`${API}/api/price-history/${selected}`)
      .then(r => setHistories(h => ({ ...h, [selected]: asArray(r.data) })))
      .catch(() => setHistories(h => ({ ...h, [selected]: [] })))
  }, [selected, histories])

  // Reset to first page when search/sort changes
  useEffect(() => { setPage(1) }, [search, sortBy])

  const filteredSorted = (() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? agents.filter(a =>
          a.ticker.toLowerCase().includes(q) ||
          (a.full_name || '').toLowerCase().includes(q))
      : agents
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price_asc': return parseFloat(a.price) - parseFloat(b.price)
        case 'ticker_asc': return a.ticker.localeCompare(b.ticker)
        case 'tasks_desc': return (b.tasks_completed || 0) - (a.tasks_completed || 0)
        case 'wallet_desc': return parseFloat(b.wallet || 0) - parseFloat(a.wallet || 0)
        case 'price_desc':
        default: return parseFloat(b.price) - parseFloat(a.price)
      }
    })
  })()

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const paginated = filteredSorted.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE)

  const agent = agents.find(a => a.ticker === selected)
  const history = histories[selected] || []
  const successRate = agent
    ? agent.tasks_completed + agent.tasks_failed === 0 ? 0
      : Math.round((agent.tasks_completed / (agent.tasks_completed + agent.tasks_failed)) * 100)
    : 0

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
                {a.ticker}{a.status === 'bankrupt' && ' 💀'}
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
                  <div style={{
                    fontFamily: "'Syne', sans-serif", fontSize: '2.2rem', fontWeight: 800,
                    color: parseFloat(agent.price) >= 1 ? (AGENT_COLORS[agent.ticker] || agentColor(agent.ticker)) : 'var(--red)'
                  }}>
                    ${parseFloat(agent.price).toFixed(4)}
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: parseFloat(agent.price) >= 1 ? 'var(--green)' : 'var(--red)' }}>
                    {parseFloat(agent.price) >= 1 ? '▲' : '▼'} {Math.abs((parseFloat(agent.price) - 1) * 100).toFixed(2)}% since launch
                  </div>
                  <span className={`badge ${agent.status === 'bankrupt' ? 'badge-red' : 'badge-green'}`} style={{ marginTop: '8px', display: 'inline-block' }}>
                    {agent.status}
                  </span>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* ROW 1: Stats (left) + Holdings (right) */}
          <ScrollReveal delay={100}>
            <div className="profile-top-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>

              {/* Left: Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', alignContent: 'start' }}>
                {[
                  { label: 'Wallet Balance', value: `$${parseFloat(agent.wallet).toFixed(2)}`,       sub: 'available funds',   icon: Wallet,      color: 'var(--blue)',  bg: '#eff4ff' },
                  { label: 'Total Earned',   value: `$${parseFloat(agent.total_earned).toFixed(2)}`, sub: 'by completed task', icon: TrendingUp,  color: 'var(--green)', bg: '#edfaf4' },
                  { label: 'Tasks Won',      value: agent.tasks_completed,                           sub: 'completed',         icon: Target,      color: 'var(--green)', bg: '#edfaf4' },
                  { label: 'Tasks Lost',     value: agent.tasks_failed,                              sub: 'failed',            icon: Zap,         color: 'var(--red)',   bg: '#fff0f3' },
                  { label: 'Cycles Done',    value: agent.cycle_count || 0,                          sub: 'total cycles',      icon: Zap,         color: 'var(--blue)',  bg: '#eff4ff' },
                  ...(agent.status === 'bankrupt' && agent.final_price
                    ? [{ label: 'Final Price', value: `$${parseFloat(agent.final_price).toFixed(4)}`, sub: 'at bankruptcy', icon: TrendingDown, color: 'var(--red)', bg: '#fff0f3' }]
                    : []
                  ),
                ].map((s, i) => (
                  <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px' }}>
                    <div>
                      <div style={{ fontSize: '0.52rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif", marginBottom: '2px' }}>
                        <CountUp
                          value={parseFloat(s.value.toString().replace(/[^0-9.]/g, '')) || 0}
                          prefix={s.value.toString().startsWith('$') ? '$' : ''}
                          decimals={s.value.toString().includes('.') ? 2 : 0}
                        />
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>{s.sub}</div>
                    </div>
                    <div style={{ background: s.bg, padding: '6px', borderRadius: '6px', flexShrink: 0 }}>
                      <s.icon size={12} color={s.color} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Holdings */}
              <div>
                {agent.shares_owned && typeof agent.shares_owned === 'object' && Object.keys(agent.shares_owned).length > 0 ? (
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Holdings</div>
                      <span className="badge badge-blue">SHARES</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      {Object.entries(agent.shares_owned).map(([ticker, o]) => (
                        <div key={ticker} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px 12px', background: 'var(--bg3)', borderRadius: '8px',
                          border: '1px solid var(--border)'
                        }}>
                          <span style={{ fontWeight: 700, color: AGENT_COLORS[ticker] || agentColor(ticker) }}>{ticker}</span>
                          <span style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                            {o?.shares ?? o} share{(o?.shares ?? o) !== 1 ? 's' : ''}
                            {o?.avg_buy_price != null && (
                              <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>@ ${parseFloat(o.avg_buy_price).toFixed(4)} avg</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="card" style={{ color: 'var(--text3)', fontSize: '0.78rem', textAlign: 'center', padding: '24px' }}>
                    No holdings yet
                  </div>
                )}
              </div>

            </div>
          </ScrollReveal>

          {/* ROW 2: Performance Metrics (left) + Price History (right) */}
          <ScrollReveal delay={200}>
            <div className="profile-bottom-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>

              {/* Left: Performance Metrics */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Performance Metrics</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {[
                    { label: 'Success Rate',      value: agent.ticker === 'BRAHMA' ? 'N/A — Investor Only' : `${successRate}%`, pct: successRate,                                        color: successRate >= 70 ? 'var(--green)' : successRate >= 50 ? 'var(--gold)' : 'var(--red)' },
                    { label: 'Wallet Health',      value: `$${parseFloat(agent.wallet).toFixed(2)} / $10.00`,                    pct: Math.min(parseFloat(agent.wallet) * 10, 100),      color: parseFloat(agent.wallet) < 1 ? 'var(--red)' : 'var(--green)' },
                    { label: 'Earnings Progress',  value: `$${parseFloat(agent.total_earned).toFixed(2)} earned`,                pct: Math.min(parseFloat(agent.total_earned) * 5, 100), color: 'var(--blue)' },
                  ].map((m, i) => (
                    <AnimatedBar key={`${agent.ticker}-${i}`} label={m.label} value={m.value} pct={m.pct} color={m.color} delay={i * 150} />
                  ))}
                </div>
              </div>

              {/* Right: Price History */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Price History</div>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={history.map((p, i) => ({ cycle: i + 1, price: parseFloat(p.price) }))}>
                    <XAxis dataKey="cycle" tick={{ fontSize: 9, fill: '#8896a8' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#8896a8' }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid #1e2730', borderRadius: '8px', fontSize: '0.7rem' }} />
                    <Line type="monotone" dataKey="price" stroke={AGENT_COLORS[agent.ticker] || agentColor(agent.ticker)} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

            </div>
          </ScrollReveal>

        </div>
      )}
    </div>
  )
}