import { useEffect, useState } from 'react'
import axios from 'axios'
import { ArrowRight, Filter } from 'lucide-react'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'

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

export default function TradeHistory() {
  const [trades, setTrades] = useState([])
  const [allAgents, setAllAgents] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)

  const fetchTrades = () => {
    axios.get(`${API}/api/trades?limit=100`)
      .then(r => { setTrades(r.data || []); setLoading(false) })
      .catch(() => { setTrades([]); setLoading(false) })
  }

  useEffect(() => {
    fetchTrades()
    axios.get(`${API}/api/agents`).then(r => setAllAgents(r.data || [])).catch(() => {})
  }, [])

  usePageFocus(fetchTrades)

  useEffect(() => {
    const interval = setInterval(fetchTrades, 15000)
    return () => clearInterval(interval)
  }, [])

  const agents = ['ALL', ...allAgents.map(a => a.ticker)]
  const filtered = filter === 'ALL' ? trades
    : trades.filter(t => t.buyer_ticker === filter || t.seller_ticker === filter)

  const totalVolume = trades.reduce((s, t) => s + parseFloat(t.total_cost), 0)
  const totalFees = trades.reduce((s, t) => s + parseFloat(t.fee), 0)
  const avgTradeSize = trades.length ? totalVolume / trades.length : 0

  return (
    <div className="fade-in">
      <ScrollReveal delay={0}>
        <div className="page-header">
          <div className="page-title">Trade History</div>
          <div className="page-subtitle">All agent-to-agent trades executed autonomously</div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={100}>
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
      </ScrollReveal>

      <ScrollReveal delay={150}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Filter size={14} color="var(--text3)" />
          {agents.map(a => (
            <button key={a} onClick={() => setFilter(a)} style={{
              background: filter === a ? agentColor(a) : 'var(--bg2)',
              color: filter === a ? '#fff' : 'var(--text2)',
              border: `1px solid ${filter === a ? agentColor(a) : 'var(--border)'}`,
              padding: '5px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: "'Geist Mono', monospace",
              fontSize: '0.72rem',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}>
              {a}
            </button>
          ))}
          <span style={{ fontSize: '0.7rem', color: 'var(--text3)', marginLeft: 'auto' }}>
            {filtered.length} trades
          </span>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={200}>
        <div className="card">
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
                {filtered.map((trade, i) => (
                  <tr key={trade.id}>
                    <td style={{ color: 'var(--text3)', fontSize: '0.7rem' }}>{filtered.length - i}</td>
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
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: '0.8rem' }}>
                No trades found
              </div>
            )}
          </div>
        </div>
      </ScrollReveal>
    </div>
  )
}