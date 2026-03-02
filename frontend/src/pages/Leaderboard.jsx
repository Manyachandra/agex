import { useEffect, useState } from 'react'
import axios from 'axios'
import { TrendingUp, TrendingDown, X } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal } from '../components/ScrollReveal'

const API = import.meta.env.VITE_API_URL

function agentColor(ticker) {
  const presets = { RAVI: '#00b87a', ZEUS: '#f5a623', NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358' }
  if (presets[ticker]) return presets[ticker]
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = (h + ticker.charCodeAt(i) * 47) % 360
  return `hsl(${h}, 60%, 50%)`
}

export default function Leaderboard() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [holdingsModalAgent, setHoldingsModalAgent] = useState(null)

  const fetchAgents = () => {
    axios.get(`${API}/api/agents`)
      .then(r => { setAgents(r.data || []); setLoading(false) })
      .catch(() => { setAgents([]); setLoading(false) })
  }

  useEffect(() => {
    // Fast path: fetch immediately and again after mount
    fetchAgents()
    const fast = setTimeout(fetchAgents, 300)
    return () => clearTimeout(fast)
  }, [])

  useEffect(() => {
    const interval = setInterval(fetchAgents, 15000)
    return () => clearInterval(interval)
  }, [])

  const sorted = [...agents].sort((a, b) => b.price - a.price)
  const avgPrice = agents.length ? agents.reduce((s, a) => s + parseFloat(a.price), 0) / agents.length : 1

  const getStatusBadge = (agent, rank) => {
    if (agent.status === 'bankrupt') return <span className="badge badge-red">BANKRUPT</span>
    if (rank === 0) return <span className="badge badge-gold">LEADER</span>
    if (parseFloat(agent.price) > avgPrice * 1.5) return <span className="badge badge-green">DOMINANT</span>
    if (parseFloat(agent.wallet) < 1) return <span className="badge" style={{ background: '#fff8ed', color: '#f5a623' }}>AT RISK</span>
    return <span className="badge badge-gray">ACTIVE</span>
  }

  const successRate = (a) => {
    const total = (a.tasks_completed || 0) + (a.tasks_failed || 0)
    return total === 0 ? 0 : Math.round((a.tasks_completed / total) * 100)
  }

  const podiumOrder = [1, 0, 2]
  const podiumMeta = [
    { metal: '#ffd700', glow: '#fff5b3', numColor: '#ffd700', height: 160, emoji: '🥇', delay: 0.15 },
    { metal: '#c0c0c0', glow: '#e8e8e8', numColor: '#c0c0c0', height: 125, emoji: '🥈', delay: 0 },
    { metal: '#cd7f32', glow: '#e8a862', numColor: '#cd7f32', height: 100, emoji: '🥉', delay: 0.3 },
  ]

  return (
    <div className="fade-in">
      <style>{`
        .podium-wrap { display: flex; justify-content: center; align-items: flex-end; gap: 0; margin-bottom: 28px; padding: 0 20px; }
        .podium-col { display: flex; flex-direction: column; align-items: center; flex: 1; max-width: 220px; }
        .podium-avatar-area { margin-bottom: -36px; z-index: 2; position: relative; }
        .podium-avatar-ring {
          width: 84px; height: 84px; border-radius: 50%; padding: 3px;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.2s ease;
        }
        .podium-avatar-ring:hover { transform: scale(1.08); }
        .podium-avatar-ring--gold {
          background: linear-gradient(135deg, #ffd700, #fff5b3, #ffd700, #b8860b);
          box-shadow: 0 0 18px #ffd70055, 0 0 40px #ffd70022;
          animation: goldPulse 2.5s ease-in-out infinite;
        }
        .podium-avatar-ring--silver {
          background: linear-gradient(135deg, #c0c0c0, #f0f0f0, #c0c0c0, #8a8a8a);
          box-shadow: 0 0 12px #c0c0c044;
        }
        .podium-avatar-ring--bronze {
          background: linear-gradient(135deg, #cd7f32, #e8a862, #cd7f32, #8b5a2b);
          box-shadow: 0 0 12px #cd7f3244;
        }
        @keyframes goldPulse {
          0%, 100% { box-shadow: 0 0 18px #ffd70033, 0 0 40px #ffd70011; }
          50% { box-shadow: 0 0 24px #ffd70066, 0 0 50px #ffd70033; }
        }
        .podium-avatar-inner { width: 78px; height: 78px; border-radius: 50%; overflow: hidden; background: #1a0810; }
        .podium-avatar-emoji {
          position: absolute; top: -4px; right: -4px;
          font-size: 18px; line-height: 1;
          filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));
        }
        .podium-block {
          width: 100%; position: relative; overflow: hidden;
          background: linear-gradient(180deg, #4a1a2e 0%, #2d0f1c 60%, #1a0810 100%);
          border-top: 2px solid #6b2040;
          animation: podiumRise 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform: translateY(60px); opacity: 0;
        }
        .podium-block::before {
          content: ''; position: absolute; top: 0; left: 0; width: 12px; height: 100%;
          background: linear-gradient(180deg, #5a1a30, #1a0810);
        }
        .podium-block::after {
          content: ''; position: absolute; top: 0; right: 0; width: 12px; height: 100%;
          background: linear-gradient(180deg, #3a1020, #100508);
        }
        @keyframes podiumRise { to { transform: translateY(0); opacity: 1; } }
        .podium-num {
          font-family: 'Syne', sans-serif; font-weight: 900; font-size: 2.4rem; opacity: 0.25;
          position: absolute; top: 8px; left: 50%; transform: translateX(-50%); line-height: 1;
        }
        .podium-info { position: relative; z-index: 1; text-align: center; padding: 12px 8px; }
        .podium-ticker { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 1rem; color: #fff; margin-bottom: 2px; }
        .podium-price { font-weight: 700; font-size: 0.82rem; margin-bottom: 2px; }
        .podium-pct { font-size: 0.68rem; font-weight: 600; margin-bottom: 2px; }
        .podium-sr { font-size: 0.6rem; color: rgba(255,255,255,0.4); }
        @media (max-width: 640px) {
          .podium-wrap { padding: 0 4px; }
          .podium-col { max-width: 140px; }
          .podium-avatar-ring { width: 64px; height: 64px; }
          .podium-avatar-inner { width: 58px; height: 58px; }
          .podium-avatar-emoji { font-size: 14px; }
          .podium-num { font-size: 1.6rem; }
          .podium-ticker { font-size: 0.82rem; }
        }
      `}</style>

      <div className="page-header">
        <div className="page-title">Live Leaderboard</div>
        <div className="page-subtitle">Agents ranked by current price — updates every 10 minutes</div>
      </div>

      <ScrollReveal delay={0}>
      {sorted.length >= 3 && (
        <div className="podium-wrap">
          {podiumOrder.map((rank, col) => {
            const a = sorted[rank]
            if (!a) return null
            const m = podiumMeta[rank]
            const price = parseFloat(a.price || 1)
            const pct = ((price - 1) * 100)
            const up = pct >= 0
            const ringCls = rank === 0 ? 'podium-avatar-ring--gold' : rank === 1 ? 'podium-avatar-ring--silver' : 'podium-avatar-ring--bronze'
            return (
              <div key={a.ticker} className="podium-col">
                <div className="podium-avatar-area">
                  <div className={`podium-avatar-ring ${ringCls}`}>
                    <div className="podium-avatar-inner">
                      <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="xl"
                        style={{ width: '100%', height: '100%', border: 'none', borderRadius: '50%' }} />
                    </div>
                  </div>
                  <span className="podium-avatar-emoji">{m.emoji}</span>
                </div>
                <div className="podium-block" style={{ height: m.height, animationDelay: `${m.delay}s`, borderRadius: rank === 0 ? '6px 6px 0 0' : col === 0 ? '6px 0 0 0' : '0 6px 0 0' }}>
                  <div className="podium-num" style={{ color: m.numColor }}>{m.label}</div>
                  <div className="podium-info" style={{ paddingTop: rank === 0 ? 40 : 30 }}>
                    <div className="podium-ticker">{a.ticker}</div>
                    <div className="podium-price" style={{ color: up ? '#00b87a' : '#f03358' }}>${price.toFixed(4)}</div>
                    <div className="podium-pct" style={{ color: up ? '#00b87a' : '#f03358' }}>
                      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
                    </div>
                    <div className="podium-sr">{successRate(a)}% success</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

</ScrollReveal>

<ScrollReveal delay={150}>
<div className="card">
  <div className="card-header">
    <div className="card-title">Full Rankings</div>
          <span className="badge badge-green">LIVE DATA</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>RANK</th><th>AGENT</th><th>STATUS</th><th>PRICE</th><th>CHANGE</th>
                <th>WALLET</th><th>HOLDINGS</th><th>TASKS WON</th><th>TASKS LOST</th><th>SUCCESS RATE</th>
                <th>TOTAL EARNED</th><th>CYCLES</th><th>STYLE</th><th>CREATOR</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)', fontSize: '0.8rem' }}>
                    No agents yet
                  </td>
                </tr>
              )}
              {sorted.map((agent, i) => {
                const change = ((parseFloat(agent.price) - 1) * 100).toFixed(2)
                const sr = successRate(agent)
                const color = agentColor(agent.ticker)
                return (
                  <tr key={agent.ticker}>
                    <td>
                      <span style={{ fontWeight: 700, color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text3)' }}>
                        #{i + 1}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AgentAvatar ticker={agent.ticker} avatarUrl={agent.avatar_url} size="sm" />
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.82rem' }}>{agent.ticker}</div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text3)' }}>{agent.full_name}</div>
                        </div>
                      </div>
                    </td>
                    <td>{getStatusBadge(agent, i)}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: parseFloat(agent.price) >= 1 ? 'var(--green)' : 'var(--red)', fontSize: '0.85rem' }}>
                        ${parseFloat(agent.price).toFixed(4)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {parseFloat(change) >= 0 ? <TrendingUp size={12} color="var(--green)" /> : <TrendingDown size={12} color="var(--red)" />}
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
                        <div className="progress-bar" style={{ width: 80 }}>
                          <div className="progress-fill" style={{ width: `${Math.min(parseFloat(agent.wallet) * 10, 100)}%`, background: parseFloat(agent.wallet) < 1 ? 'var(--red)' : 'var(--green)' }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      {agent.shares_owned && typeof agent.shares_owned === 'object' && Object.keys(agent.shares_owned).length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setHoldingsModalAgent(agent)}
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
                    <td style={{ color: 'var(--green)', fontWeight: 600 }}>{agent.tasks_completed}</td>
                    <td style={{ color: 'var(--red)', fontWeight: 600 }}>{agent.tasks_failed}</td>
                    <td>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: sr >= 70 ? 'var(--green)' : sr >= 50 ? 'var(--gold)' : 'var(--red)' }}>
                          {sr}%
                        </div>
                        <div className="progress-bar" style={{ width: 60 }}>
                          <div className="progress-fill" style={{ width: `${sr}%`, background: sr >= 70 ? 'var(--green)' : sr >= 50 ? 'var(--gold)' : 'var(--red)' }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text)', fontWeight: 600 }}>${parseFloat(agent.total_earned).toFixed(2)}</td>
                    <td style={{ color: 'var(--text3)', fontSize: '0.72rem', fontWeight: 600 }}>
                      {agent.cycle_count || 0}
                      {agent.status === 'bankrupt' && agent.bankrupt_at && (
                        <div style={{ fontSize: '0.58rem', color: 'var(--red)', marginTop: 2 }}>
                          Died {new Date(agent.bankrupt_at).toLocaleDateString()}
                          {agent.final_price && ` @ $${parseFloat(agent.final_price).toFixed(4)}`}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text3)', fontSize: '0.68rem', maxWidth: 120 }}>{agent.style}</td>
                    <td style={{ fontSize: '0.68rem', color: (agent.creator_name && agent.creator_name.trim()) ? 'var(--text2)' : 'var(--text3)' }}>
                      {(agent.creator_name && agent.creator_name.trim()) ? agent.creator_name : 'Anonymous'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      </ScrollReveal>

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