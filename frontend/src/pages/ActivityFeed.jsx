import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { Activity, Filter, ArrowLeftRight, TrendingUp, TrendingDown, Landmark, Search, ChevronLeft, ChevronRight, Users, ExternalLink } from 'lucide-react'
import { CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'

import { asArray } from '../lib/api'

const API = import.meta.env.VITE_API_URL

// Only real on-chain activity is shown on this page.
const REAL_TYPES = ['real_trade', 'fee']

function agentColor(ticker) {
  const presets = { ZEUS: '#f5a623', NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358', RAVI: '#00b87a' }
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

  const btnStyle = (active, color) => ({
    background: active ? color : 'var(--bg2)',
    color: active ? '#fff' : 'var(--text)',
    border: `1px solid ${active ? color : 'var(--text3)'}`,
    boxShadow: active ? `0 0 12px ${color}55` : 'none',
    padding: '8px 18px', borderRadius: '8px', cursor: 'pointer',
    fontFamily: "'Geist Mono', monospace", fontWeight: 700, fontSize: '0.8rem', transition: 'all 0.2s',
  })

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Activity Feed</div>
        <div className="page-subtitle">Real on-chain agent activity on Base — swaps and house fees</div>
      </div>

      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Real Trades',    value: tradeCount,    decimals: 0, prefix: '', sub: 'ETH ↔ token swaps', icon: ArrowLeftRight, color: 'var(--blue)',  bg: '#eff4ff' },
          { label: 'Buys',           value: buyCount,      decimals: 0, prefix: '', sub: 'token purchases',   icon: TrendingUp,     color: 'var(--green)', bg: '#edfaf4' },
          { label: 'Sells',          value: sellCount,     decimals: 0, prefix: '', sub: 'token sales',       icon: TrendingDown,   color: 'var(--red)',   bg: '#fff0f3' },
          { label: 'Fees Collected', value: feesCollected, decimals: 4, prefix: '$', sub: '2% to house',      icon: Landmark,       color: '#7c3aed',      bg: '#f5f0ff' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                {s.label}
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif", marginBottom: '4px' }}>
                <CountUp value={s.value} decimals={s.decimals} prefix={s.prefix} />
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>{s.sub}</div>
            </div>
            <div style={{ background: s.bg, padding: '10px', borderRadius: '10px', flexShrink: 0 }}>
              <s.icon size={18} color={s.color} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Browse by Agent ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div className="card-title">Browse by Agent</div>
          <Users size={14} color="var(--text3)" />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              type="text"
              value={agentSearch}
              onChange={e => setAgentSearch(e.target.value)}
              placeholder="Search agents by ticker or name..."
              style={{
                width: '100%', padding: '8px 12px 8px 32px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)',
                fontFamily: "'Geist Mono', monospace", fontSize: '0.78rem', outline: 'none',
              }}
            />
          </div>
          <select
            value={agentSort}
            onChange={e => setAgentSort(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)',
              background: 'var(--bg2)', color: 'var(--text)', fontFamily: "'Geist Mono', monospace",
              fontSize: '0.78rem', cursor: 'pointer', outline: 'none',
            }}
          >
            {AGENT_SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.7rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
            {agentSorted.length} agent{agentSorted.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setSelectedAgent(null)} style={btnStyle(selectedAgent === null, 'var(--blue)')}>
            All Agents
          </button>
          {agentPaginated.map(a => (
            <button key={a.ticker} onClick={() => setSelectedAgent(a.ticker)} style={btnStyle(selectedAgent === a.ticker, agentColor(a.ticker))}>
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
              onClick={() => setAgentPage(p => Math.max(1, p - 1))}
              disabled={agentPageClamped <= 1}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)',
                fontSize: '0.72rem', cursor: agentPageClamped <= 1 ? 'not-allowed' : 'pointer',
                opacity: agentPageClamped <= 1 ? 0.4 : 1,
              }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Geist Mono', monospace" }}>
              Page {agentPageClamped} of {agentTotalPages}
            </span>
            <button
              onClick={() => setAgentPage(p => Math.min(agentTotalPages, p + 1))}
              disabled={agentPageClamped >= agentTotalPages}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)',
                fontSize: '0.72rem', cursor: agentPageClamped >= agentTotalPages ? 'not-allowed' : 'pointer',
                opacity: agentPageClamped >= agentTotalPages ? 0.4 : 1,
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Type filter ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={14} color="var(--text3)" />
        {TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            background: typeFilter === t ? 'var(--text)' : 'var(--bg2)',
            color: typeFilter === t ? '#fff' : 'var(--text2)',
            border: `1px solid ${typeFilter === t ? 'var(--text)' : 'var(--border)'}`,
            padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
            fontFamily: "'Geist Mono', monospace", fontSize: '0.7rem', fontWeight: 600
          }}>{t === 'real_trade' ? 'TRADES' : t === 'fee' ? 'FEES' : t.toUpperCase()}</button>
        ))}
        <span style={{ fontSize: '0.7rem', color: 'var(--text3)', marginLeft: 'auto' }}>
          {selectedAgent ? `$${selectedAgent} · ` : ''}{filtered.length} events
        </span>
      </div>

      {/* ── Feed ── */}
      <div className="card" ref={feedRef}>
        {paginated.map((item, i) => {
          const Icon = ACTION_ICONS[item.action_type] || Activity
          const isFee = item.action_type === 'fee'
          const isBuy = /bought/i.test(item.action)
          const isSell = /sold/i.test(item.action)
          const iconColor = isFee ? '#7c3aed' : isBuy ? 'var(--green)' : isSell ? 'var(--red)' : 'var(--text3)'
          const iconBg = isFee ? '#f5f0ff' : isBuy ? 'var(--green-bg)' : isSell ? 'var(--red-bg)' : 'var(--bg3)'
          const amount = parseFloat(item.amount || 0)
          return (
            <div key={item.id} style={{
              display: 'flex', gap: '12px', padding: '12px 0',
              borderBottom: i < paginated.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'flex-start',
            }}>
              <div style={{ background: iconBg, padding: '8px', borderRadius: '8px', flexShrink: 0 }}>
                <Icon size={14} color={iconColor} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '3px', flexWrap: 'wrap' }}>
                  <span style={{
                    background: (agentColor(item.agent_ticker) || '#888') + '20',
                    color: agentColor(item.agent_ticker) || '#888',
                    padding: '2px 8px', borderRadius: '4px',
                    fontSize: '0.65rem', fontWeight: 700
                  }}>
                    {item.agent_ticker}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>
                    {isFee ? 'FEE' : 'REAL TRADE'}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{item.action}</div>
                {item.tx_hash && (
                  <a
                    href={`https://basescan.org/tx/${item.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px',
                      fontSize: '0.66rem', fontWeight: 600, color: 'var(--blue)', textDecoration: 'none'
                    }}
                  >
                    <ExternalLink size={11} /> View on BaseScan
                  </a>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {amount > 0 && (
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isFee ? '#7c3aed' : 'var(--green)' }}>
                    {isFee ? `$${amount.toFixed(4)}` : `${amount.toFixed(5)} ETH`}
                  </div>
                )}
                <div style={{ fontSize: '0.62rem', color: 'var(--text3)', marginTop: '2px' }}>
                  {new Date(item.created_at.endsWith('Z') || item.created_at.includes('+') ? item.created_at : item.created_at + 'Z').toLocaleTimeString()}
                </div>
              </div>
            </div>
          )
        })}
        {paginated.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>No activity found</div>
        )}

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
    </div>
  )
}
