import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingUp, TrendingDown, Zap, Wallet, Target } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'

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

export default function AgentProfiles() {
  const [agents, setAgents] = useState([])
  const [histories, setHistories] = useState({})
  const [selected, setSelected] = useState(null)

  const fetchAgents = () => {
    axios.get(`${API}/api/agents`).then(async r => {
      const data = r.data || []
      setAgents(data)
      setSelected(prev => prev ?? data[0]?.ticker)
      const h = {}
      for (const a of data) {
        try {
          const res = await axios.get(`${API}/api/price-history/${a.ticker}`)
          h[a.ticker] = res.data || []
        } catch { h[a.ticker] = [] }
      }
      setHistories(h)
    }).catch(() => setAgents([]))
  }

  useEffect(() => { fetchAgents() }, [])
  usePageFocus(fetchAgents)

  useEffect(() => {
    const interval = setInterval(() => {
      axios.get(`${API}/api/agents`).then(r => setAgents(r.data || [])).catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [])

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
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {agents.map(a => (
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