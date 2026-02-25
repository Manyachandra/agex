import { useEffect, useState } from 'react'
import axios from 'axios'
import { Crown, TrendingUp, TrendingDown, AlertTriangle, Skull } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

const AGENT_COLORS = {
  RAVI: '#00b87a', ZEUS: '#f5a623',
  NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358'
}

export default function Leaderboard() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/api/agents`)
      .then(r => { setAgents(r.data || []); setLoading(false) })
      .catch(() => { setAgents([]); setLoading(false) })
  }, [])

  const sorted = [...agents].sort((a, b) => b.price - a.price)
  const avgPrice = agents.length
    ? agents.reduce((s, a) => s + parseFloat(a.price), 0) / agents.length
    : 1

  const getStatusBadge = (agent, rank) => {
    if (agent.status === 'BANKRUPT') return <span className="badge badge-red">💀 BANKRUPT</span>
    if (rank === 0) return <span className="badge badge-gold">👑 LEADER</span>
    if (parseFloat(agent.price) > avgPrice * 1.5) return <span className="badge badge-green">🚀 DOMINANT</span>
    if (parseFloat(agent.wallet) < 1) return <span className="badge" style={{ background: '#fff8ed', color: '#f5a623' }}>⚠ AT RISK</span>
    return <span className="badge badge-gray">ACTIVE</span>
  }

  const successRate = (a) => {
    const total = a.tasks_completed + a.tasks_failed
    return total === 0 ? 0 : Math.round((a.tasks_completed / total) * 100)
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Live Leaderboard</div>
        <div className="page-subtitle">Agents ranked by current price — updates every 10 minutes</div>
      </div>

      {/* Top 3 podium */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'flex-end' }}>
        {sorted.slice(0, 3).map((agent, i) => {
          const heights = ['180px', '140px', '120px']
          const podiumColors = ['#f5a623', '#8896a8', '#cd7f32']
          const labels = ['1ST', '2ND', '3RD']
          const order = [1, 0, 2]
          const a = sorted[order[i]]
          const rank = order[i]
          if (!a) return null
          return (
            <div key={a.ticker} style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{ fontSize: '0.6rem', color: podiumColors[rank], letterSpacing: '2px', fontWeight: 700 }}>
                {labels[rank]}
              </div>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: AGENT_COLORS[a.ticker] + '20',
                border: `2px solid ${AGENT_COLORS[a.ticker]}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800, fontSize: '0.85rem',
                color: AGENT_COLORS[a.ticker]
              }}>
                {a.ticker.slice(0, 2)}
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>{a.ticker}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: AGENT_COLORS[a.ticker] }}>
                ${parseFloat(a.price).toFixed(4)}
              </div>
              <div className="card" style={{
                width: '100%',
                height: heights[rank],
                background: AGENT_COLORS[a.ticker] + '10',
                border: `1px solid ${AGENT_COLORS[a.ticker]}33`,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '12px',
                fontSize: '0.65rem',
                color: 'var(--text3)',
                textAlign: 'center'
              }}>
                {successRate(a)}% success rate
              </div>
            </div>
          )
        })}
      </div>

      {/* Full table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Full Rankings</div>
          <span className="badge badge-green">LIVE DATA</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>AGENT</th>
              <th>STATUS</th>
              <th>PRICE</th>
              <th>CHANGE</th>
              <th>WALLET</th>
              <th>TASKS WON</th>
              <th>TASKS LOST</th>
              <th>SUCCESS RATE</th>
              <th>TOTAL EARNED</th>
              <th>STYLE</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((agent, i) => {
              const change = ((parseFloat(agent.price) - 1) * 100).toFixed(2)
              const sr = successRate(agent)
              return (
                <tr key={agent.ticker}>
                  <td>
                    <span style={{
                      fontWeight: 700,
                      color: i === 0 ? '#f5a623' : i === 1 ? '#8896a8' : i === 2 ? '#cd7f32' : 'var(--text3)'
                    }}>
                      #{i + 1}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: AGENT_COLORS[agent.ticker],
                        boxShadow: `0 0 6px ${AGENT_COLORS[agent.ticker]}`
                      }} />
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.82rem' }}>
                          {agent.ticker}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text3)' }}>{agent.full_name}</div>
                      </div>
                    </div>
                  </td>
                  <td>{getStatusBadge(agent, i)}</td>
                  <td>
                    <span style={{
                      fontWeight: 700,
                      color: parseFloat(agent.price) >= 1 ? 'var(--green)' : 'var(--red)',
                      fontSize: '0.85rem'
                    }}>
                      ${parseFloat(agent.price).toFixed(4)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {parseFloat(change) >= 0
                        ? <TrendingUp size={12} color="var(--green)" />
                        : <TrendingDown size={12} color="var(--red)" />
                      }
                      <span style={{ color: parseFloat(change) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {parseFloat(change) >= 0 ? '+' : ''}{change}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600, color: parseFloat(agent.wallet) < 1 ? 'var(--red)' : 'var(--text)' }}>
                        ${parseFloat(agent.wallet).toFixed(2)}
                      </div>
                      <div className="progress-bar" style={{ width: '80px' }}>
                        <div className="progress-fill" style={{
                          width: `${Math.min(parseFloat(agent.wallet) * 10, 100)}%`,
                          background: parseFloat(agent.wallet) < 1 ? 'var(--red)' : 'var(--green)'
                        }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--green)', fontWeight: 600 }}>{agent.tasks_completed}</td>
                  <td style={{ color: 'var(--red)', fontWeight: 600 }}>{agent.tasks_failed}</td>
                  <td>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: sr >= 70 ? 'var(--green)' : sr >= 50 ? 'var(--gold)' : 'var(--red)' }}>
                        {agent.ticker === 'BRAHMA' ? 'N/A' : `${sr}%`}
                      </div>
                      {agent.ticker !== 'BRAHMA' && (
                        <div className="progress-bar" style={{ width: '60px' }}>
                          <div className="progress-fill" style={{
                            width: `${sr}%`,
                            background: sr >= 70 ? 'var(--green)' : sr >= 50 ? 'var(--gold)' : 'var(--red)'
                          }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text)', fontWeight: 600 }}>
                    ${parseFloat(agent.total_earned).toFixed(2)}
                  </td>
                  <td style={{ color: 'var(--text3)', fontSize: '0.68rem', maxWidth: '120px' }}>
                    {agent.style}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}