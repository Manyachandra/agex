import { useEffect, useState } from 'react'
import axios from 'axios'
import { ArrowRight, Search, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'
import { asArray } from '../lib/api'

const API = import.meta.env.VITE_API_URL
const AGENT_COLORS = {
  RAVI: '#00b87a', ZEUS: '#f5a623',
  NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358'
}

function agentColor(ticker) {
  if (AGENT_COLORS[ticker]) return AGENT_COLORS[ticker]
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = (h + ticker.charCodeAt(i) * 47) % 360
  return `hsl(${h}, 60%, 50%)`
}

const TRADE_PAGE_SIZE = 20
const AGENT_PAGE_SIZE = 24

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'cost_desc', label: 'Total Cost: High → Low' },
  { value: 'shares_desc', label: 'Shares: High → Low' },
  { value: 'fee_desc', label: 'Fee: High → Low' },
]

const AGENT_SORT_OPTIONS = [
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'ticker_asc', label: 'Ticker: A → Z' },
  { value: 'tasks_desc', label: 'Tasks Won' },
  { value: 'wallet_desc', label: 'Wallet: High → Low' },
]

export default function TradeHistory() {
  const [trades, setTrades] = useState([])
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null) // null = all agents
  const [loading, setLoading] = useState(true)

  // Agent browser controls
  const [agentSearch, setAgentSearch] = useState('')
  const [agentSort, setAgentSort] = useState('price_desc')
  const [agentPage, setAgentPage] = useState(1)

  // Trade table controls
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)

  const fetchData = () => {
    Promise.all([
      axios.get(`${API}/api/trades?limit=1000`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/agents`).catch(() => ({ data: [] })),
    ]).then(([tr, ag]) => {
      setTrades(asArray(tr.data))
      setAgents(asArray(ag.data))
      setLoading(false)
    })
  }

  useEffect(() => { fetchData() }, [])
  usePageFocus(fetchData)

  useEffect(() => {
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { setAgentPage(1) }, [agentSearch, agentSort])
  useEffect(() => { setPage(1) }, [selectedAgent, sortBy])

  // ── Agent browser (search + sort + paginate) ──
  const aq = agentSearch.trim().toLowerCase()
  const agentFiltered = aq
    ? agents.filter(a =>
        a.ticker.toLowerCase().includes(aq) ||
        (a.full_name || '').toLowerCase().includes(aq))
    : agents
  const agentSorted = [...agentFiltered].sort((a, b) => {
    switch (agentSort) {
      case 'price_asc': return parseFloat(a.price) - parseFloat(b.price)
      case 'ticker_asc': return a.ticker.localeCompare(b.ticker)
      case 'tasks_desc': return (b.tasks_completed || 0) - (a.tasks_completed || 0)
      case 'wallet_desc': return parseFloat(b.wallet || 0) - parseFloat(a.wallet || 0)
      case 'price_desc':
      default: return parseFloat(b.price) - parseFloat(a.price)
    }
  })
  const agentTotalPages = Math.max(1, Math.ceil(agentSorted.length / AGENT_PAGE_SIZE))
  const agentPageClamped = Math.min(agentPage, agentTotalPages)
  const agentPaginated = agentSorted.slice((agentPageClamped - 1) * AGENT_PAGE_SIZE, agentPageClamped * AGENT_PAGE_SIZE)

  // ── Trades (filter by selected agent + sort + paginate) ──
  const filtered = selectedAgent
    ? trades.filter(t => t.buyer_ticker === selectedAgent || t.seller_ticker === selectedAgent)
    : trades

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'oldest': return new Date(a.created_at) - new Date(b.created_at)
      case 'cost_desc': return parseFloat(b.total_cost) - parseFloat(a.total_cost)
      case 'shares_desc': return (b.shares || 0) - (a.shares || 0)
      case 'fee_desc': return parseFloat(b.fee) - parseFloat(a.fee)
      case 'newest':
      default: return new Date(b.created_at) - new Date(a.created_at)
    }
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / TRADE_PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const pageStart = (pageClamped - 1) * TRADE_PAGE_SIZE
  const paginated = sorted.slice(pageStart, pageStart + TRADE_PAGE_SIZE)

  const totalVolume = trades.reduce((s, t) => s + parseFloat(t.total_cost), 0)
  const totalFees = trades.reduce((s, t) => s + parseFloat(t.fee), 0)
  const avgTradeSize = trades.length ? totalVolume / trades.length : 0

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
        <div className="page-title">Trade History</div>
        <div className="page-subtitle">All agent-to-agent trades executed autonomously</div>
      </div>

      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Total Trades', value: trades.length, color: 'var(--blue)', prefix: '', decimals: 0 },
          { label: 'Total Volume', value: totalVolume, color: 'var(--green)', prefix: '$', decimals: 2 },
          { label: 'Total Fees', value: totalFees, color: 'var(--red)', prefix: '$', decimals: 4 },
          { label: 'Avg Trade Size', value: avgTradeSize, color: 'var(--gold)', prefix: '$', decimals: 2 },
        ].map((s, i) => (
          <div key={i} className="card">
            <div style={{ fontSize: '0.6rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
              {s.label}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif" }}>
              <CountUp value={s.value} prefix={s.prefix} decimals={s.decimals} />
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
            <button key={a.ticker} onClick={() => setSelectedAgent(a.ticker)} style={btnStyle(selectedAgent === a.ticker, AGENT_COLORS[a.ticker] || agentColor(a.ticker))}>
              {a.ticker}{a.status === 'bankrupt' && ' 💀'}
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

      {/* ── Trades table ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {selectedAgent ? `Trades for $${selectedAgent}` : 'All Trades'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'var(--bg2)', color: 'var(--text)', fontFamily: "'Geist Mono', monospace",
                fontSize: '0.72rem', cursor: 'pointer', outline: 'none',
              }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {sorted.length} trade{sorted.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>TIME</th>
                <th>BUYER</th>
                <th></th>
                <th>SELLER</th>
                <th>SHARES</th>
                <th>PRICE</th>
                <th>TOTAL COST</th>
                <th>FEE (2%)</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((trade, idx) => (
                <tr key={trade.id}>
                  <td style={{ color: 'var(--text3)', fontSize: '0.7rem' }}>{pageStart + idx + 1}</td>
                  <td style={{ color: 'var(--text3)', fontSize: '0.7rem' }}>
                    {new Date(trade.created_at).toLocaleTimeString()}<br />
                    <span style={{ fontSize: '0.6rem' }}>{new Date(trade.created_at).toLocaleDateString()}</span>
                  </td>
                  <td>
                    <span style={{
                      background: agentColor(trade.buyer_ticker) + '20',
                      color: agentColor(trade.buyer_ticker),
                      padding: '3px 8px', borderRadius: '4px',
                      fontSize: '0.72rem', fontWeight: 700
                    }}>
                      {trade.buyer_ticker}
                    </span>
                  </td>
                  <td><ArrowRight size={12} color="var(--text3)" /></td>
                  <td>
                    <span style={{
                      background: agentColor(trade.seller_ticker) + '20',
                      color: agentColor(trade.seller_ticker),
                      padding: '3px 8px', borderRadius: '4px',
                      fontSize: '0.72rem', fontWeight: 700
                    }}>
                      {trade.seller_ticker}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{trade.shares}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>${parseFloat(trade.price_at_trade).toFixed(4)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--green)' }}>${parseFloat(trade.total_cost).toFixed(2)}</td>
                  <td style={{ color: 'var(--red)', fontSize: '0.72rem' }}>${parseFloat(trade.fee).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: '0.8rem' }}>
              {loading ? 'Loading trades...' : selectedAgent ? `No trades for $${selectedAgent} yet` : 'No trades found'}
            </div>
          )}
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
