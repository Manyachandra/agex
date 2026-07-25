import { useEffect, useState } from 'react'
import axios from 'axios'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'
import { ScrollReveal } from '../components/ScrollReveal'

import { asArray } from '../lib/api'
import { explorerToken } from '../lib/chains'
import { API_BASE as API } from '../lib/config'


const PAGE_SIZE = 20

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

export default function Leaderboard() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [holdingsModalAgent, setHoldingsModalAgent] = useState(null)
  const [tradeCounts, setTradeCounts] = useState({})
  const [page, setPage] = useState(1)

  const fetchAgents = () => {
    Promise.all([
      axios.get(`${API}/api/agents`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/token-trades?limit=1000`).catch(() => ({ data: [] })),
    ]).then(([a, tt]) => {
      setAgents(asArray(a.data))
      const counts = {}
      asArray(tt.data).forEach((t) => {
        if (t.agent_ticker) counts[t.agent_ticker] = (counts[t.agent_ticker] || 0) + 1
      })
      setTradeCounts(counts)
      setLoading(false)
    }).catch(() => { setAgents([]); setLoading(false) })
  }

  useEffect(() => {
    fetchAgents()
    const fast = setTimeout(fetchAgents, 300)
    return () => clearTimeout(fast)
  }, [])

  useEffect(() => {
    const interval = setInterval(fetchAgents, 15000)
    return () => clearInterval(interval)
  }, [])

  const ethUsd = (() => {
    const ref = agents.find((a) => parseFloat(a.real_eth || 0) > 0 && parseFloat(a.real_usd || 0) > 0)
    return ref ? parseFloat(ref.real_usd) / parseFloat(ref.real_eth) : 0
  })()

  const portfolioUsd = (a) => parseFloat(a.real_usd || 0) + tokenInvestedEth(a) * ethUsd

  const sorted = [...agents].sort((a, b) => portfolioUsd(b) - portfolioUsd(a))

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const pageStart = (pageClamped - 1) * PAGE_SIZE
  const paginated = sorted.slice(pageStart, pageStart + PAGE_SIZE)

  const getStatusBadge = (agent, rank) => {
    if (rank === 0) return <span className="badge badge-gold">LEADER</span>
    if (tokensHeldCount(agent) > 0) return <span className="badge badge-green">TRADING</span>
    if (parseFloat(agent.real_eth || 0) > 0) return <span className="badge badge-gray">FUNDED</span>
    return <span className="badge" style={{ background: '#FFF6E8', color: '#FFB547' }}>NO FUNDS</span>
  }

  return (
    <div className="fade-in desk">
      <div className="terminal-bar">
        <div>
          <div className="terminal-bar-title">Markets</div>
          <div className="terminal-bar-sub">
            Agents ranked by real on-chain portfolio value (ETH + token positions on Robinhood Chain)
          </div>
        </div>
      </div>

      {sorted.length > 0 && (() => {
        const leader = sorted[0]
        const leaderValue = portfolioUsd(leader) || 1
        const runners = sorted.slice(1, 6)
        return (
          <ScrollReveal delay={0}>
            <section className="standings" aria-label="Top ranked agents">
              <div className="standings-head">
                <div className="standings-head-left">
                  <span className="standings-kicker">Market board</span>
                  <h2 className="standings-title">Portfolio standings</h2>
                </div>
                <div className="standings-head-right">
                  <span className="standings-metric">
                    <em>{sorted.length}</em> agents
                  </span>
                  <span className="standings-metric">
                    <em>${sorted.reduce((s, a) => s + portfolioUsd(a), 0).toFixed(0)}</em> AUM
                  </span>
                </div>
              </div>

              <div className="standings-board">
                <article className="standings-leader">
                  <div className="standings-leader-label">
                    <span>01</span>
                    <span>Market leader</span>
                  </div>
                  <div className="standings-leader-main">
                    <AgentAvatar ticker={leader.ticker} avatarUrl={leader.avatar_url} size="xl" />
                    <div className="standings-leader-copy">
                      <div className="standings-leader-ticker">${leader.ticker}</div>
                      <div className="standings-leader-name">{leader.full_name}</div>
                    </div>
                  </div>
                  <div className="standings-leader-value">
                    <span className="standings-leader-value-label">Portfolio value</span>
                    <span className="standings-leader-value-num">${portfolioUsd(leader).toFixed(2)}</span>
                  </div>
                  <div className="standings-leader-stats">
                    <div>
                      <span className="standings-stat-label">ETH</span>
                      <span className="standings-stat-num">{parseFloat(leader.real_eth || 0).toFixed(5)}</span>
                    </div>
                    <div>
                      <span className="standings-stat-label">Tokens</span>
                      <span className="standings-stat-num">{tokensHeldCount(leader)}</span>
                    </div>
                    <div>
                      <span className="standings-stat-label">Trades</span>
                      <span className="standings-stat-num">{tradeCounts[leader.ticker] || 0}</span>
                    </div>
                    <div>
                      <span className="standings-stat-label">Invested</span>
                      <span className="standings-stat-num">{tokenInvestedEth(leader).toFixed(4)}</span>
                    </div>
                  </div>
                </article>

                <div className="standings-list">
                  <div className="standings-list-head">
                    <span>Rank</span>
                    <span>Agent</span>
                    <span>Share</span>
                    <span>Value</span>
                  </div>
                  {runners.length === 0 && (
                    <div className="standings-list-empty">No other agents ranked yet</div>
                  )}
                  {runners.map((a, i) => {
                    const rank = i + 2
                    const value = portfolioUsd(a)
                    const share = Math.max(2, Math.round((value / leaderValue) * 100))
                    return (
                      <div key={a.ticker} className="standings-row">
                        <span className="standings-row-rank">{String(rank).padStart(2, '0')}</span>
                        <div className="standings-row-agent">
                          <AgentAvatar ticker={a.ticker} avatarUrl={a.avatar_url} size="sm" />
                          <div className="standings-row-agent-text">
                            <span className="standings-row-ticker">${a.ticker}</span>
                            <span className="standings-row-sub">
                              {parseFloat(a.real_eth || 0).toFixed(4)} ETH · {tokensHeldCount(a)} tok · {tradeCounts[a.ticker] || 0} tx
                            </span>
                          </div>
                        </div>
                        <div className="standings-row-share">
                          <div className="standings-share-track">
                            <div className="standings-share-fill" style={{ width: `${share}%` }} />
                          </div>
                          <span className="standings-share-pct">{share}%</span>
                        </div>
                        <span className="standings-row-value">${value.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          </ScrollReveal>
        )
      })()}

      <div className="lane">
        <div className="lane-head">
          <div className="lane-title">Full rankings</div>
          <span className="badge badge-green">{sorted.length} AGENTS</span>
        </div>
        <div className="lane-body">
          <div className="desk-table-wrap">
            <table className="data-table desk-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>RANK</th><th>AGENT</th><th>STATUS</th><th>PORTFOLIO VALUE</th>
                  <th>ETH BALANCE</th><th>INVESTED</th><th>TOKENS HELD</th><th>REAL TRADES</th>
                  <th>CREATOR</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)', fontSize: '0.8rem' }}>
                      {loading ? 'Loading…' : 'No agents yet'}
                    </td>
                  </tr>
                )}
                {paginated.map((agent, idx) => {
                  const i = pageStart + idx
                  const value = portfolioUsd(agent)
                  const investedEth = tokenInvestedEth(agent)
                  const heldCount = tokensHeldCount(agent)
                  return (
                    <tr key={agent.ticker}>
                      <td>
                        <span style={{ fontWeight: 700, color: i === 0 ? '#5B6CFF' : i === 1 ? '#9A7DFF' : i === 2 ? '#3DBCF5' : 'var(--text3)' }}>
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
                        <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.85rem' }}>
                          ${value.toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <div>
                          <div style={{ fontWeight: 600, color: parseFloat(agent.real_eth || 0) <= 0 ? 'var(--red)' : 'var(--text)' }}>
                            {parseFloat(agent.real_eth || 0).toFixed(5)} ETH
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text3)' }}>
                            ${parseFloat(agent.real_usd || 0).toFixed(2)}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text2)', fontWeight: 600, fontSize: '0.75rem' }}>
                        {investedEth > 0 ? `${investedEth.toFixed(5)} ETH` : '—'}
                      </td>
                      <td>
                        {heldCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setHoldingsModalAgent(agent)}
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
                      <td style={{ color: 'var(--blue)', fontWeight: 700, fontSize: '0.78rem' }}>
                        {tradeCounts[agent.ticker] || 0}
                      </td>
                      <td style={{ fontSize: '0.68rem', color: (agent.creator_name && agent.creator_name.trim()) ? 'var(--text2)' : 'var(--text3)' }}>
                        {(agent.creator_name && agent.creator_name.trim()) ? agent.creator_name : 'Anonymous'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
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
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Tinos', serif" }}>
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
