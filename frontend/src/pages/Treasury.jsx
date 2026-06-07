import { useEffect, useState } from 'react'
import axios from 'axios'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp, Percent, Landmark, ExternalLink } from 'lucide-react'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'
import { asArray } from '../lib/api'

const API = import.meta.env.VITE_API_URL

// Parse the trade side ("buy"/"sell") from a fee activity action string.
function feeSide(action = '') {
  if (/on sell/i.test(action)) return 'sell'
  if (/on buy/i.test(action)) return 'buy'
  return ''
}

export default function Treasury() {
  const [treasury, setTreasury] = useState(null)
  const [fees, setFees] = useState([])
  const [tokenTrades, setTokenTrades] = useState([])
  const [feeHistory, setFeeHistory] = useState([])

  const fetchTreasuryAndTrades = () => {
    Promise.all([
      axios.get(`${API}/api/treasury`).catch(() => ({ data: null })),
      axios.get(`${API}/api/fees?limit=200`).catch(() => ({ data: [] })),
      axios.get(`${API}/api/token-trades?limit=1000`).catch(() => ({ data: [] })),
    ]).then(([t, f, tt]) => {
      setTreasury(t.data)
      const feeData = asArray(f.data)
      setFees(feeData)
      setTokenTrades(asArray(tt.data))

      // Cumulative collected-fee curve (oldest → newest).
      const cumulative = []
      let running = 0
      ;[...feeData].reverse().forEach((fee, i) => {
        running += parseFloat(fee.amount || 0)
        cumulative.push({ trade: i + 1, fees: parseFloat(running.toFixed(6)) })
      })
      setFeeHistory(cumulative)
    }).catch(() => {})
  }

  useEffect(() => { fetchTreasuryAndTrades() }, [])
  usePageFocus(fetchTreasuryAndTrades)

  useEffect(() => {
    const interval = setInterval(fetchTreasuryAndTrades, 15000)
    return () => clearInterval(interval)
  }, [])

  const totalEthVolume = tokenTrades.reduce((s, t) => s + parseFloat(t.eth_amount || 0), 0)
  const avgFee = fees.length ? fees.reduce((s, f) => s + parseFloat(f.amount || 0), 0) / fees.length : 0

  return (
    <div className="fade-in">
      <style>{`
        @media (min-width: 768px) {
          .treasury-stats-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>

      <ScrollReveal delay={0}>
        <div className="page-header">
          <div className="page-title">Treasury & Finance</div>
          <div className="page-subtitle">Exchange revenue, fees collected, and financial metrics</div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <div className="treasury-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
          {[
            { label: 'Total Fees Collected', value: parseFloat(treasury?.total_fees || 0),    prefix: '$', decimals: 4, icon: DollarSign, color: '#00b87a', bg: '#edfaf4' },
            { label: 'Exchange Wallet',       value: parseFloat(treasury?.exchange_wallet || 0), prefix: '$', decimals: 4, icon: Landmark,   color: '#2563eb', bg: '#eff4ff' },
            { label: 'Total ETH Volume',      value: totalEthVolume,                            prefix: '',  decimals: 5, suffix: ' ETH', icon: TrendingUp, color: '#f5a623', bg: '#fff8ed' },
            { label: 'Fee Rate',              value: 2,                                         prefix: '',  decimals: 2, suffix: '%', icon: Percent, color: '#7c3aed', bg: '#f5f0ff' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif" }}>
                  <CountUp value={s.value} prefix={s.prefix} decimals={s.decimals} suffix={s.suffix || ''} />
                </div>
              </div>
              <div style={{ background: s.bg, padding: '6px', borderRadius: '8px', flexShrink: 0 }}>
                <s.icon size={14} color={s.color} />
              </div>
            </div>
          ))}
        </div>
      </ScrollReveal>

      <ScrollReveal delay={150}>
        <div className="grid-2" style={{ marginBottom: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Cumulative Fees</div>
              <span className="badge badge-green">GROWING</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={feeHistory}>
                <XAxis dataKey="trade" tick={{ fontSize: 10, fill: '#8896a8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#8896a8' }} />
                <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid #1e2730', borderRadius: '8px', fontSize: '0.72rem' }} />
                <Area type="monotone" dataKey="fees" stroke="#00b87a" fill="#00b87a20" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Treasury Breakdown</div>
            </div>
            {[
              { label: 'Total Trades Executed',  value: treasury?.total_trades || 0,    color: 'var(--blue)' },
              { label: 'Fee Transactions',        value: fees.length,                    color: 'var(--green)' },
              { label: 'Avg Fee Per Trade',       value: `$${avgFee.toFixed(4)}`,        color: 'var(--gold)' },
              { label: 'Total ETH Volume',        value: `${totalEthVolume.toFixed(5)} ETH`, color: 'var(--purple)' },
              { label: 'Exchange Operating Day',  value: `Day ${treasury?.exchange_day || 1}`, color: 'var(--text)' },
              { label: 'Revenue Model',           value: '2% on every real trade',       color: 'var(--text3)' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: i < 5 ? '1px solid var(--border)' : 'none'
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{item.label}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={200}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Fee Transactions</div>
            <span className="badge badge-gray">{fees.length} fees</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>AGENT</th>
                  <th>SIDE</th>
                  <th>FEE COLLECTED</th>
                  <th>RUNNING TOTAL</th>
                  <th>TX</th>
                </tr>
              </thead>
              <tbody>
                {fees.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text3)', fontSize: '0.8rem' }}>
                      No fee transactions yet
                    </td>
                  </tr>
                ) : (
                  (() => {
                    return [...fees].slice(0, 20).map((fee, idx, arr) => {
                      // Running total = sum of this fee + all older displayed fees.
                      const runningTotal = arr.slice(idx).reduce((s, f) => s + parseFloat(f.amount || 0), 0)
                      const side = feeSide(fee.action)
                      const isBuy = side === 'buy'
                      return (
                        <tr key={fee.id}>
                          <td style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>
                            {new Date(fee.created_at).toLocaleTimeString()}
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--text)' }}>{fee.agent_ticker}</td>
                          <td>
                            {side ? (
                              <span style={{
                                background: isBuy ? '#edfaf4' : '#fff0f3',
                                color: isBuy ? 'var(--green)' : 'var(--red)',
                                padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800
                              }}>{side.toUpperCase()}</span>
                            ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                          </td>
                          <td style={{ color: 'var(--green)', fontWeight: 600 }}>${parseFloat(fee.amount || 0).toFixed(4)}</td>
                          <td style={{ color: 'var(--text)', fontWeight: 700 }}>${runningTotal.toFixed(4)}</td>
                          <td>
                            {fee.tx_hash ? (
                              <a href={`https://basescan.org/tx/${fee.tx_hash}`} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--blue)', fontSize: '0.68rem', fontWeight: 600, textDecoration: 'none' }}>
                                <ExternalLink size={11} /> View
                              </a>
                            ) : <span style={{ color: 'var(--text3)', fontSize: '0.68rem' }}>—</span>}
                          </td>
                        </tr>
                      )
                    })
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      </ScrollReveal>
    </div>
  )
}