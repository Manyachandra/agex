import { useEffect, useState } from 'react'
import axios from 'axios'
import { Search, ChevronLeft, ChevronRight, Users, ExternalLink } from 'lucide-react'
import { CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'
import { asArray } from '../lib/api'
import { explorerTx, explorerToken } from '../lib/chains'
import { API_BASE as API } from '../lib/config'

const AGENT_COLORS = {
  RAVI: '#18B368', ZEUS: '#FFB547',
  NOVA: '#9A7DFF', BRAHMA: '#5B6CFF', KIRA: '#FF5A70'
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
  { value: 'eth_desc', label: 'ETH Amount: High → Low' },
  { value: 'side_buy', label: 'Buys First' },
  { value: 'side_sell', label: 'Sells First' },
]

const AGENT_SORT_OPTIONS = [
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'ticker_asc', label: 'Ticker: A → Z' },
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
      axios.get(`${API}/api/token-trades?limit=1000`).catch(() => ({ data: [] })),
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
    ? trades.filter(t => t.agent_ticker === selectedAgent)
    : trades

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'oldest': return new Date(a.created_at) - new Date(b.created_at)
      case 'eth_desc': return parseFloat(b.eth_amount || 0) - parseFloat(a.eth_amount || 0)
      case 'side_buy': return (a.side === 'buy' ? 0 : 1) - (b.side === 'buy' ? 0 : 1)
      case 'side_sell': return (a.side === 'sell' ? 0 : 1) - (b.side === 'sell' ? 0 : 1)
      case 'newest':
      default: return new Date(b.created_at) - new Date(a.created_at)
    }
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / TRADE_PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const pageStart = (pageClamped - 1) * TRADE_PAGE_SIZE
  const paginated = sorted.slice(pageStart, pageStart + TRADE_PAGE_SIZE)

  const totalEthVolume = trades.reduce((s, t) => s + parseFloat(t.eth_amount || 0), 0)
  const buyCount = trades.filter(t => t.side === 'buy').length
  const sellCount = trades.filter(t => t.side === 'sell').length

  return (
    <div className="fade-in desk">
      <div className="terminal-bar">
        <div>
          <div className="terminal-bar-title">Trade History</div>
          <div className="terminal-bar-sub">Real on-chain ETH ↔ token swaps executed by agents on Robinhood Chain</div>
        </div>
      </div>

      <div className="terminal-metrics">
        {[
          { label: 'Total Trades', value: trades.length, color: 'var(--blue)', prefix: '', decimals: 0, suffix: '', sub: 'All on-chain swaps' },
          { label: 'ETH Volume', value: totalEthVolume, color: 'var(--green)', prefix: '', decimals: 5, suffix: ' ETH', sub: 'Cumulative volume' },
          { label: 'Buys', value: buyCount, color: 'var(--green)', prefix: '', decimals: 0, suffix: '', sub: 'Token purchases' },
          { label: 'Sells', value: sellCount, color: 'var(--red)', prefix: '', decimals: 0, suffix: '', sub: 'Token sales' },
        ].map((s, i) => (
          <div key={i} className="terminal-metric">
            <div className="terminal-metric-label">{s.label}</div>
            <div className="terminal-metric-value" style={{ color: s.color }}>
              <CountUp value={s.value} prefix={s.prefix} decimals={s.decimals} suffix={s.suffix || ''} />
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

      {/* ── Trades table ── */}
      <div className="lane">
        <div className="lane-head">
          <div className="lane-title">
            {selectedAgent ? `Trades for $${selectedAgent}` : 'All Trades'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              className="desk-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ minWidth: 140, padding: '6px 10px', fontSize: '0.72rem' }}
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
        <div className="lane-body">
          <div className="desk-table-wrap">
            <table className="data-table desk-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>TIME</th>
                  <th>AGENT</th>
                  <th>SIDE</th>
                  <th>TOKEN</th>
                  <th>TOKEN AMOUNT</th>
                  <th>ETH AMOUNT</th>
                  <th>TX</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((trade, idx) => {
                  const isBuy = trade.side === 'buy'
                  return (
                  <tr key={trade.id}>
                    <td style={{ color: 'var(--text3)', fontSize: '0.7rem' }}>{pageStart + idx + 1}</td>
                    <td style={{ color: 'var(--text3)', fontSize: '0.7rem' }}>
                      {new Date(trade.created_at).toLocaleTimeString()}<br />
                      <span style={{ fontSize: '0.6rem' }}>{new Date(trade.created_at).toLocaleDateString()}</span>
                    </td>
                    <td>
                      <span style={{
                        background: agentColor(trade.agent_ticker) + '20',
                        color: agentColor(trade.agent_ticker),
                        padding: '3px 8px', borderRadius: '4px',
                        fontSize: '0.72rem', fontWeight: 700
                      }}>
                        {trade.agent_ticker}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        background: isBuy ? '#E8F8F0' : '#FFECEF',
                        color: isBuy ? 'var(--green)' : 'var(--red)',
                        padding: '3px 8px', borderRadius: '4px',
                        fontSize: '0.65rem', fontWeight: 800
                      }}>
                        {(trade.side || '').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {trade.token_address ? (
                        <a href={explorerToken(trade.token_address)} target="_blank" rel="noopener noreferrer"
                          style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
                          ${trade.token_symbol || '???'}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>${trade.token_symbol || '???'}</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--gold)' }}>
                      {parseFloat(trade.token_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td style={{ fontWeight: 600, color: isBuy ? 'var(--red)' : 'var(--green)' }}>
                      {isBuy ? '-' : '+'}{parseFloat(trade.eth_amount || 0).toFixed(6)} ETH
                    </td>
                    <td>
                      {trade.tx_hash ? (
                        <a href={explorerTx(trade.tx_hash)} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--blue)', fontSize: '0.68rem', fontWeight: 600, textDecoration: 'none' }}>
                          <ExternalLink size={11} /> View
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: '0.68rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                  )
                })}
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
