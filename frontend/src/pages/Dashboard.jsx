import { useEffect, useState } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, ArrowLeftRight, Zap, Users, AlertTriangle, Crown } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

const AGENT_COLORS = {
  RAVI: '#00b87a', ZEUS: '#f5a623',
  NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358'
}

export default function Dashboard({ agents: liveAgents, treasury: liveTreasury }) {
  const [agents, setAgents] = useState([])
  const [treasury, setTreasury] = useState(null)
  const [activity, setActivity] = useState([])
  const [stats, setStats] = useState(null)
  const [priceHistory, setPriceHistory] = useState([])

  useEffect(() => {
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
    fetchAll()
  }, [])

  useEffect(() => {
    if (liveAgents?.length) setAgents(liveAgents)
    if (liveTreasury) setTreasury(liveTreasury)
  }, [liveAgents, liveTreasury])

  const sorted = [...agents].sort((a, b) => b.price - a.price)
  const leader = sorted[0]
  const riskAgent = [...agents].filter(a => a.status === 'ACTIVE').sort((a, b) => a.wallet - b.wallet)[0]

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
            value: agents.filter(a => a.status === 'ACTIVE').length,
            sub: `${agents.filter(a => a.status === 'BANKRUPT').length} bankrupt`,
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

        {/* Top 3 + Risk Alert */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Leader Card */}
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

          {/* Risk Alert */}
          {riskAgent && parseFloat(riskAgent.wallet) < 3 && (
            <div className="card" style={{
              background: '#fff8f0',
              border: '1px solid #ffd4a8'
            }}>
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

          {/* Quick Leaderboard */}
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header">
              <div className="card-title">Rankings</div>
              <span className="badge badge-gray">TOP 5</span>
            </div>
            {sorted.map((agent, i) => (
              <div key={agent.ticker} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    color: i === 0 ? '#f5a623' : 'var(--text3)',
                    fontWeight: i === 0 ? 700 : 400,
                    width: '20px'
                  }}>#{i + 1}</span>
                  <div
                    style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: AGENT_COLORS[agent.ticker]
                    }}
                  />
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>{agent.ticker}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: parseFloat(agent.price) >= 1 ? 'var(--green)' : 'var(--red)' }}>
                    ${parseFloat(agent.price).toFixed(4)}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: parseFloat(agent.price) >= 1 ? 'var(--green)' : 'var(--red)' }}>
                    {parseFloat(agent.price) >= 1 ? '▲' : '▼'} {Math.abs((parseFloat(agent.price) - 1) * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
                  background: AGENT_COLORS[item.agent_ticker] + '20',
                  color: AGENT_COLORS[item.agent_ticker],
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
                {parseFloat(item.amount) > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>
                    +${parseFloat(item.amount).toFixed(2)}
                  </span>
                )}
                <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>
                  {new Date(item.created_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}