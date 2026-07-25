import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { Activity, Filter, ArrowLeftRight, Landmark, Search, ChevronLeft, ChevronRight, Users, ExternalLink } from 'lucide-react'
import { CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'

import { asArray } from '../lib/api'
import { explorerTx } from '../lib/chains'
import { API_BASE as API } from '../lib/config'


// Only real on-chain activity is shown on this page.
const REAL_TYPES = ['real_trade', 'fee']

function agentColor(ticker) {
  const presets = { ZEUS: '#FFB547', NOVA: '#9A7DFF', BRAHMA: '#5B6CFF', KIRA: '#FF5A70', RAVI: '#18B368' }
  if (presets[ticker]) return presets[ticker]
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = (h + ticker.charCodeAt(i) * 47) % 360
  return `hsl(${h}, 60%, 50%)`
}

const ACTION_ICONS = {
  real_trade: ArrowLeftRight,
  fee: Landmark,
  registration: Activity
}

const PAGE_SIZE = 20
const AGENT_PAGE_SIZE = 24

const AGENT_SORT_OPTIONS = [
  { value: 'eth_desc', label: 'ETH Balance: High → Low' },
  { value: 'eth_asc', label: 'ETH Balance: Low → High' },
  { value: 'ticker_asc', label: 'Ticker: A → Z' },
]

const TYPES = ['ALL', 'real_trade', 'fee']

export default function ActivityFeed() {
  const [activity, setActivity] = useState([])
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null) // null = all
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [page, setPage] = useState(1)

  // Agent browser controls
  const [agentSearch, setAgentSearch] = useState('')
  const [agentSort, setAgentSort] = useState('price_desc')
  const [agentPage, setAgentPage] = useState(1)

  const feedRef = useRef(null)

  const fetchActivity = () => {
    axios.get(`${API}/api/activity?limit=400`)
      .then(r => setActivity(asArray(r.data).filter(a => REAL_TYPES.includes(a.action_type))))
      .catch(() => {})
  }

  useEffect(() => {
    axios.get(`${API}/api/agents`).then(r => setAgents(asArray(r.data))).catch(() => {})
    fetchActivity()
    const interval = setInterval(fetchActivity, 15000)
    return () => clearInterval(interval)
  }, [])

  usePageFocus(fetchActivity)

  useEffect(() => { setPage(1) }, [selectedAgent, typeFilter])
  useEffect(() => { setAgentPage(1) }, [agentSearch, agentSort])

  // ── Agent browser ──
  const aq = agentSearch.trim().toLowerCase()
  const agentFiltered = aq
    ? agents.filter(a =>
        a.ticker.toLowerCase().includes(aq) ||
        (a.full_name || '').toLowerCase().includes(aq))
    : agents
  const agentSorted = [...agentFiltered].sort((a, b) => {
    switch (agentSort) {
      case 'eth_asc': return parseFloat(a.real_eth || 0) - parseFloat(b.real_eth || 0)
      case 'ticker_asc': return a.ticker.localeCompare(b.ticker)
      case 'eth_desc':
      default: return parseFloat(b.real_eth || 0) - parseFloat(a.real_eth || 0)
    }
  })
  const agentTotalPages = Math.max(1, Math.ceil(agentSorted.length / AGENT_PAGE_SIZE))
  const agentPageClamped = Math.min(agentPage, agentTotalPages)
  const agentPaginated = agentSorted.slice((agentPageClamped - 1) * AGENT_PAGE_SIZE, agentPageClamped * AGENT_PAGE_SIZE)

  // ── Activity (filter + paginate) ──
  const filtered = activity.filter(a => {
    const agentMatch = !selectedAgent || a.agent_ticker === selectedAgent
    const typeMatch = typeFilter === 'ALL' || a.action_type === typeFilter
    return agentMatch && typeMatch
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const pageStart = (pageClamped - 1) * PAGE_SIZE
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const realTrades = activity.filter(a => a.action_type === 'real_trade')
  const tradeCount = realTrades.length
  const buyCount = realTrades.filter(a => /bought/i.test(a.action)).length
  const sellCount = realTrades.filter(a => /sold/i.test(a.action)).length
  const feesCollected = activity
    .filter(a => a.action_type === 'fee')
    .reduce((s, a) => s + parseFloat(a.amount || 0), 0)

  return (
    <div className="fade-in desk">
      <div className="terminal-bar">
        <div>
          <div className="terminal-bar-title">Activity Feed</div>
          <div className="terminal-bar-sub">Real on-chain agent activity on Robinhood Chain — swaps and house fees</div>
        </div>
      </div>

      <div className="terminal-metrics">
        {[
          { label: 'Real Trades',    value: tradeCount,    decimals: 0, prefix: '', sub: 'ETH ↔ token swaps', color: 'var(--blue)' },
          { label: 'Buys',           value: buyCount,      decimals: 0, prefix: '', sub: 'token purchases',   color: 'var(--green)' },
          { label: 'Sells',          value: sellCount,     decimals: 0, prefix: '', sub: 'token sales',       color: 'var(--red)' },
          { label: 'Fees Collected', value: feesCollected, decimals: 4, prefix: '$', sub: '2% to house',      color: '#9A7DFF' },
        ].map((s, i) => (
          <div key={i} className="terminal-metric">
            <div className="terminal-metric-label">{s.label}</div>
            <div className="terminal-metric-value" style={{ color: s.color }}>
              <CountUp value={s.value} decimals={s.decimals} prefix={s.prefix} />
            </div>
            <div className="terminal-metric-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Browse by Agent ── */}
      <div className="lane">
        <div className="lane-head">
          <div className="lane-title">Browse by Agent</div>
          <Users size={14} color="var(--text3)" />
        </div>
        <div className="lane-body">
          <div className="desk-toolbar" style={{ marginBottom: 10 }}>
            <div className="desk-search">
              <Search size={14} color="var(--text3)" />
              <input
                type="text"
                value={agentSearch}
                onChange={e => setAgentSearch(e.target.value)}
                placeholder="Search agents by ticker or name..."
              />
            </div>
            <select
              className="desk-select"
              value={agentSort}
              onChange={e => setAgentSort(e.target.value)}
            >
              {AGENT_SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {agentSorted.length} agent{agentSorted.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="chip-row">
            <button
              type="button"
              onClick={() => setSelectedAgent(null)}
              className={`desk-chip ${selectedAgent === null ? 'desk-chip--active' : ''}`}
            >
              All Agents
            </button>
            {agentPaginated.map(a => (
              <button
                key={a.ticker}
                type="button"
                onClick={() => setSelectedAgent(a.ticker)}
                className={`desk-chip ${selectedAgent === a.ticker ? 'desk-chip--active' : ''}`}
              >
                {a.ticker}
              </button>
            ))}
            {agentPaginated.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: '0.78rem', padding: '8px 0' }}>
                No agents match "{agentSearch}"
              </div>
            )}
          </div>

          {agentTotalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => setAgentPage(p => Math.max(1, p - 1))}
                disabled={agentPageClamped <= 1}
                className="desk-chip"
                style={{ opacity: agentPageClamped <= 1 ? 0.4 : 1, cursor: agentPageClamped <= 1 ? 'not-allowed' : 'pointer' }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Tinos', serif" }}>
                Page {agentPageClamped} of {agentTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setAgentPage(p => Math.min(agentTotalPages, p + 1))}
                disabled={agentPageClamped >= agentTotalPages}
                className="desk-chip"
                style={{ opacity: agentPageClamped >= agentTotalPages ? 0.4 : 1, cursor: agentPageClamped >= agentTotalPages ? 'not-allowed' : 'pointer' }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Type filter + Feed ── */}
      <div className="lane" ref={feedRef}>
        <div className="lane-head">
          <div className="lane-title">Event stream</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Filter size={14} color="var(--text3)" />
            {TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`desk-chip ${typeFilter === t ? 'desk-chip--active' : ''}`}
              >
                {t === 'real_trade' ? 'TRADES' : t === 'fee' ? 'FEES' : t.toUpperCase()}
              </button>
            ))}
            <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>
              {selectedAgent ? `$${selectedAgent} · ` : ''}{filtered.length} events
            </span>
          </div>
        </div>
        <div className="lane-body">
          <div className="stream">
            {paginated.map((item) => {
              const Icon = ACTION_ICONS[item.action_type] || Activity
              const isFee = item.action_type === 'fee'
              const isBuy = /bought/i.test(item.action)
              const isSell = /sold/i.test(item.action)
              const iconColor = isFee ? '#9A7DFF' : isBuy ? 'var(--green)' : isSell ? 'var(--red)' : 'var(--text3)'
              const iconBg = isFee ? '#F3EEFF' : isBuy ? 'var(--green-bg)' : isSell ? 'var(--red-bg)' : 'var(--bg3)'
              const amount = parseFloat(item.amount || 0)
              return (
                <div key={item.id} className="stream-item">
                  <div className="stream-mark" style={{ background: iconBg, color: iconColor }}>
                    <Icon size={14} color={iconColor} />
                  </div>
                  <div className="stream-main">
                    <div className="stream-title" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        background: (agentColor(item.agent_ticker) || '#888') + '20',
                        color: agentColor(item.agent_ticker) || '#888',
                        padding: '2px 8px', borderRadius: '4px',
                        fontSize: '0.65rem', fontWeight: 700
                      }}>
                        {item.agent_ticker}
                      </span>
                      <span className="stream-meta">{isFee ? 'FEE' : 'REAL TRADE'}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{item.action}</div>
                    {item.tx_hash && (
                      <a
                        href={explorerTx(item.tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px',
                          fontSize: '0.66rem', fontWeight: 600, color: 'var(--blue)', textDecoration: 'none'
                        }}
                      >
                        <ExternalLink size={11} /> View on Explorer
                      </a>
                    )}
                  </div>
                  <div className="stream-side">
                    {amount > 0 && (
                      <div style={{ color: isFee ? '#9A7DFF' : 'var(--green)' }}>
                        {isFee ? `$${amount.toFixed(4)}` : `${amount.toFixed(5)} ETH`}
                      </div>
                    )}
                    <div className="stream-meta" style={{ marginTop: 2 }}>
                      {new Date(item.created_at.endsWith('Z') || item.created_at.includes('+') ? item.created_at : item.created_at + 'Z').toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              )
            })}
            {paginated.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>No activity found</div>
            )}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pageClamped <= 1}
                className="desk-chip"
                style={{ opacity: pageClamped <= 1 ? 0.4 : 1, cursor: pageClamped <= 1 ? 'not-allowed' : 'pointer' }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Tinos', serif" }}>
                Page {pageClamped} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageClamped >= totalPages}
                className="desk-chip"
                style={{ opacity: pageClamped >= totalPages ? 0.4 : 1, cursor: pageClamped >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
