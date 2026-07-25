import { useEffect, useState } from 'react'
import axios from 'axios'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { ScrollReveal, CountUp } from '../components/ScrollReveal'
import { usePageFocus } from '../hooks/usePageFocus'
import { asArray } from '../lib/api'
import { explorerTx } from '../lib/chains'
import { API_BASE as API } from '../lib/config'

const FEE_PAGE_SIZE = 20

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
  const [feePage, setFeePage] = useState(1)

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

  const feeTotalPages = Math.max(1, Math.ceil(fees.length / FEE_PAGE_SIZE))
  const feePageClamped = Math.min(feePage, feeTotalPages)
  const paginatedFees = fees.slice(
    (feePageClamped - 1) * FEE_PAGE_SIZE,
    feePageClamped * FEE_PAGE_SIZE
  )

  return (
    <div className="fade-in desk">
      <ScrollReveal delay={0}>
        <div className="terminal-bar">
          <div>
            <div className="terminal-bar-title">Treasury & Finance</div>
            <div className="terminal-bar-sub">Exchange revenue, fees collected, and financial metrics</div>
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <div className="terminal-metrics">
          {[
            { label: 'Total Fees Collected', value: parseFloat(treasury?.total_fees || 0),    prefix: '$', decimals: 4, color: '#18B368', sub: 'House take' },
            { label: 'Exchange Wallet',       value: parseFloat(treasury?.exchange_wallet || 0), prefix: '$', decimals: 4, color: '#5B6CFF', sub: 'Operating balance' },
            { label: 'Total ETH Volume',      value: totalEthVolume,                            prefix: '',  decimals: 5, suffix: ' ETH', color: '#FFB547', sub: 'All swaps' },
            { label: 'Fee Rate',              value: 2,                                         prefix: '',  decimals: 2, suffix: '%', color: '#9A7DFF', sub: 'Per real trade' },
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
      </ScrollReveal>

      <ScrollReveal delay={150}>
        <div className="terminal-split" style={{ marginBottom: 16 }}>
          <div className="lane">
            <div className="lane-head">
              <div className="lane-title">Cumulative Fees</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.55rem', color: 'var(--text3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    width: 14, height: 8,
                    background: 'linear-gradient(180deg, rgba(91,108,255,0.7), rgba(91,108,255,0.1))',
                    clipPath: 'polygon(0% 100%, 15% 35%, 50% 0%, 85% 35%, 100% 100%)',
                  }} /> FEES $
                </span>
                <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: 'currentColor',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }} />
                  GROWING
                </span>
              </div>
            </div>
            <div className="lane-body">
              {feeHistory.length === 0 ? (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '0.78rem' }}>
                  No fee history yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={[
                      { trade: '', fees: 0 },
                      ...feeHistory.map((d) => ({ trade: String(d.trade), fees: d.fees })),
                      { trade: '', fees: feeHistory[feeHistory.length - 1]?.fees || 0 },
                    ]}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="treasuryMountainFees" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5B6CFF" stopOpacity={0.55} />
                        <stop offset="45%" stopColor="#9A7DFF" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#5B6CFF" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="treasuryMountainStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#5B6CFF" />
                        <stop offset="100%" stopColor="#3DBCF5" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 8" vertical={false} stroke="#E4E7EF" />
                    <XAxis
                      dataKey="trade"
                      tick={{ fontSize: 9, fill: '#8B93A7' }}
                      axisLine={{ stroke: '#E4E7EF' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: '#8B93A7' }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      tickFormatter={(v) => (v >= 1 ? `$${v.toFixed(1)}` : `$${v.toFixed(2)}`)}
                    />
                    <Tooltip
                      cursor={{ stroke: '#5B6CFF', strokeWidth: 1, strokeDasharray: '4 4' }}
                      contentStyle={{
                        background: '#FFFFFF',
                        border: '1px solid #E4E7EF',
                        borderRadius: 0,
                        fontSize: '0.72rem',
                        boxShadow: '0 10px 40px rgba(28,39,76,0.08)',
                      }}
                      formatter={(v) => [`$${Number(v || 0).toFixed(4)}`, 'Cumulative fees']}
                      labelFormatter={(label) => (label ? `After trade #${label}` : '—')}
                    />
                    <Area
                      type="monotone"
                      dataKey="fees"
                      name="fees"
                      stroke="url(#treasuryMountainStroke)"
                      strokeWidth={2.5}
                      fill="url(#treasuryMountainFees)"
                      fillOpacity={1}
                      dot={false}
                      activeDot={{ r: 5, fill: '#5B6CFF', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="lane">
            <div className="lane-head">
              <div className="lane-title">Treasury Breakdown</div>
            </div>
            <div className="lane-body">
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
        </div>
      </ScrollReveal>

      <ScrollReveal delay={200}>
        <div className="lane">
          <div className="lane-head">
            <div className="lane-title">Recent Fee Transactions</div>
            <span className="badge badge-gray">{fees.length} fees</span>
          </div>
          <div className="lane-body">
            <div className="desk-table-wrap">
              <table className="data-table desk-table">
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
                    paginatedFees.map((fee, idx) => {
                      const globalIdx = (feePageClamped - 1) * FEE_PAGE_SIZE + idx
                      // Running total = this fee + all older fees in the full list.
                      const runningTotal = fees.slice(globalIdx).reduce((s, f) => s + parseFloat(f.amount || 0), 0)
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
                                background: isBuy ? '#E8F8F0' : '#FFECEF',
                                color: isBuy ? 'var(--green)' : 'var(--red)',
                                padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800
                              }}>{side.toUpperCase()}</span>
                            ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                          </td>
                          <td style={{ color: 'var(--green)', fontWeight: 600 }}>${parseFloat(fee.amount || 0).toFixed(4)}</td>
                          <td style={{ color: 'var(--text)', fontWeight: 700 }}>${runningTotal.toFixed(4)}</td>
                          <td>
                            {fee.tx_hash ? (
                              <a href={explorerTx(fee.tx_hash)} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--blue)', fontSize: '0.68rem', fontWeight: 600, textDecoration: 'none' }}>
                                <ExternalLink size={11} /> View
                              </a>
                            ) : <span style={{ color: 'var(--text3)', fontSize: '0.68rem' }}>—</span>}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            {feeTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setFeePage(p => Math.max(1, p - 1))}
                  disabled={feePageClamped <= 1}
                  className="desk-chip"
                  style={{ opacity: feePageClamped <= 1 ? 0.4 : 1, cursor: feePageClamped <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: "'Tinos', serif" }}>
                  Page {feePageClamped} of {feeTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setFeePage(p => Math.min(feeTotalPages, p + 1))}
                  disabled={feePageClamped >= feeTotalPages}
                  className="desk-chip"
                  style={{ opacity: feePageClamped >= feeTotalPages ? 0.4 : 1, cursor: feePageClamped >= feeTotalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </ScrollReveal>
    </div>
  )
}
