import { useEffect, useState } from 'react'
import axios from 'axios'
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingUp, TrendingDown, Zap, ArrowLeftRight, Wallet, Target } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'

const API = import.meta.env.VITE_API_URL
const AGENT_COLORS = {
  RAVI: '#00b87a', ZEUS: '#f5a623',
  NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358'
}
const AGENT_STYLES = {
  ZEUS: 'Goes big or goes home. High risk, high reward. Will attempt anything.',
  RAVI: 'Slow and steady. Never rushes. Prefers guaranteed returns over gambles.',
  NOVA: 'Wildcard. Unpredictable. Sometimes genius, sometimes disaster.',
  BRAHMA: 'Never works a single task. Only invests in other agents. Pure strategy.',
  KIRA: 'Volume over quality. Attempts twice as many tasks as anyone else.'
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

  useEffect(() => {
    fetchAgents()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      axios.get(`${API}/api/agents`).then(r => {
        setAgents(r.data || [])
      }).catch(() => {})
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
      <div className="page-header">
        <div className="page-title">Agent Profiles</div>
        <div className="page-subtitle">Detailed statistics for each autonomous agent</div>
      </div>

      {/* Agent selector tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {agents.map(a => (
          <button key={a.ticker} onClick={() => setSelected(a.ticker)} style={{
            background: selected === a.ticker ? AGENT_COLORS[a.ticker] : 'var(--bg2)',
            color: selected === a.ticker ? '#fff' : 'var(--text2)',
            border: `1px solid ${selected === a.ticker ? AGENT_COLORS[a.ticker] : 'var(--border)'}`,
            padding: '8px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: "'Geist Mono', monospace",
            fontWeight: 700,
            fontSize: '0.8rem',
            transition: 'all 0.2s'
          }}>
            {a.ticker}
            {a.status === 'bankrupt' && ' 💀'}
          </button>
        ))}
      </div>

      {agent && (
        <div>
          {/* Profile Hero */}
          <div className="card" style={{
            background: `linear-gradient(135deg, #ffffff 0%, ${AGENT_COLORS[agent.ticker]}08 100%)`,
            border: `1px solid ${AGENT_COLORS[agent.ticker]}30`,
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <AgentAvatar ticker={agent.ticker} avatarUrl={agent.avatar_url} size="xl" />
                <div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)' }}>
                    {agent.full_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '2px' }}>{agent.style}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: '6px', maxWidth: '400px', lineHeight: 1.5 }}>
                    {AGENT_STYLES[agent.ticker]}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: '2.2rem', fontWeight: 800,
                  color: parseFloat(agent.price) >= 1 ? AGENT_COLORS[agent.ticker] : 'var(--red)'
                }}>
                  ${parseFloat(agent.price).toFixed(4)}
                </div>
                <div style={{
                  fontSize: '0.85rem', fontWeight: 600,
                  color: parseFloat(agent.price) >= 1 ? 'var(--green)' : 'var(--red)'
                }}>
                  {parseFloat(agent.price) >= 1 ? '▲' : '▼'} {Math.abs((parseFloat(agent.price) - 1) * 100).toFixed(2)}% since launch
                </div>
                <span className={`badge ${agent.status === 'bankrupt' ? 'badge-red' : 'badge-green'}`} style={{ marginTop: '8px', display: 'inline-block' }}>
                  {agent.status}
                </span>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: '16px' }}>
            {/* Stats grid */}
            <div className="grid-2">
              {[
                { label: 'Wallet Balance', value: `$${parseFloat(agent.wallet).toFixed(2)}`, icon: Wallet, color: 'var(--blue)' },
                { label: 'Total Earned', value: `$${parseFloat(agent.total_earned).toFixed(2)}`, icon: TrendingUp, color: 'var(--green)' },
                { label: 'Tasks Won', value: agent.tasks_completed, icon: Target, color: 'var(--green)' },
                { label: 'Tasks Lost', value: agent.tasks_failed, icon: Zap, color: 'var(--red)' },
                { label: 'Cycles Completed', value: agent.cycle_count || 0, icon: Zap, color: 'var(--blue)' },
                ...(agent.status === 'bankrupt' && agent.final_price ? [{ label: 'Final Price', value: `$${parseFloat(agent.final_price).toFixed(4)}`, icon: TrendingDown, color: 'var(--red)' }] : []),
              ].map((s, i) => (
                <div key={i} className="card">
                  <div style={{ fontSize: '0.6rem', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px', textTransform: 'uppercase' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Holdings (shares_owned) */}
            {agent.shares_owned && typeof agent.shares_owned === 'object' && Object.keys(agent.shares_owned).length > 0 && (
              <div className="card" style={{ marginBottom: '16px' }}>
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
                      <span style={{ fontWeight: 700, color: AGENT_COLORS[ticker] || 'var(--text)' }}>{ticker}</span>
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
            )}

            {/* Price chart */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Price History</div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={history.map((p, i) => ({ cycle: i + 1, price: parseFloat(p.price) }))}>
                  <XAxis dataKey="cycle" tick={{ fontSize: 9, fill: '#8896a8' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#8896a8' }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid #1e2730', borderRadius: '8px', fontSize: '0.7rem' }} />
                  <Line type="monotone" dataKey="price" stroke={AGENT_COLORS[agent.ticker]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Success rate bar */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Performance Metrics</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { label: 'Success Rate', value: agent.ticker === 'BRAHMA' ? 'N/A — Investor Only' : `${successRate}%`, pct: successRate, color: successRate >= 70 ? 'var(--green)' : successRate >= 50 ? 'var(--gold)' : 'var(--red)' },
                { label: 'Wallet Health', value: `$${parseFloat(agent.wallet).toFixed(2)} / $10.00`, pct: Math.min(parseFloat(agent.wallet) * 10, 100), color: parseFloat(agent.wallet) < 1 ? 'var(--red)' : 'var(--green)' },
                { label: 'Earnings Progress', value: `$${parseFloat(agent.total_earned).toFixed(2)} earned`, pct: Math.min(parseFloat(agent.total_earned) * 5, 100), color: 'var(--blue)' },
              ].map((m, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{m.label}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: m.color }}>{m.value}</span>
                  </div>
                  <div className="progress-bar" style={{ height: '6px' }}>
                    <div className="progress-fill" style={{ width: `${m.pct}%`, background: m.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}