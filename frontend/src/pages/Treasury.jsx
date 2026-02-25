import { useEffect, useState } from 'react'
import axios from 'axios'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp, Percent, Landmark } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

export default function Treasury() {
  const [treasury, setTreasury] = useState(null)
  const [trades, setTrades] = useState([])
  const [feeHistory, setFeeHistory] = useState([])

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/treasury`).catch(() => ({ data: null })),
      axios.get(`${API}/api/trades?limit=100`).catch(() => ({ data: [] }))
    ]).then(([t, tr]) => {
      setTreasury(t.data)
      const tradeData = tr.data || []
      setTrades(tradeData)
      const cumulative = []
      let running = 0
      ;[...tradeData].reverse().forEach((trade, i) => {
        running += parseFloat(trade.fee)
        if (i % 2 === 0) {
          cumulative.push({
            trade: i + 1,
            fees: parseFloat(running.toFixed(4))
          })
        }
      })
      setFeeHistory(cumulative)
    }).catch(() => {})
  }, [])

  const totalVolume = trades.reduce((s, t) => s + parseFloat(t.total_cost), 0)
  const avgFee = trades.length ? trades.reduce((s, t) => s + parseFloat(t.fee), 0) / trades.length : 0

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Treasury & Finance</div>
        <div className="page-subtitle">Exchange revenue, fees collected, and financial metrics</div>
      </div>

      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Total Fees Collected', value: `$${parseFloat(treasury?.total_fees || 0).toFixed(4)}`, icon: DollarSign, color: '#00b87a', bg: '#edfaf4' },
          { label: 'Exchange Wallet', value: `$${parseFloat(treasury?.exchange_wallet || 0).toFixed(4)}`, icon: Landmark, color: '#2563eb', bg: '#eff4ff' },
          { label: 'Total Trade Volume', value: `$${totalVolume.toFixed(2)}`, icon: TrendingUp, color: '#f5a623', bg: '#fff8ed' },
          { label: 'Fee Rate', value: '2.00%', icon: Percent, color: '#7c3aed', bg: '#f5f0ff' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif" }}>{s.value}</div>
            </div>
            <div style={{ background: s.bg, padding: '10px', borderRadius: '10px' }}>
              <s.icon size={18} color={s.color} />
            </div>
          </div>
        ))}
      </div>

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
            { label: 'Total Trades Executed', value: treasury?.total_trades || 0, color: 'var(--blue)' },
            { label: 'Total Tasks Attempted', value: treasury?.total_tasks || 0, color: 'var(--green)' },
            { label: 'Avg Fee Per Trade', value: `$${avgFee.toFixed(4)}`, color: 'var(--gold)' },
            { label: 'Total Volume Processed', value: `$${totalVolume.toFixed(2)}`, color: 'var(--purple)' },
            { label: 'Exchange Operating Day', value: `Day ${treasury?.exchange_day || 1}`, color: 'var(--text)' },
            { label: 'Revenue Model', value: '2% on every trade', color: 'var(--text3)' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: i < 5 ? '1px solid var(--border)' : 'none'
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{item.label}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Fee Transactions</div>
          <span className="badge badge-gray">{trades.length} trades</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>TIME</th>
              <th>BUYER</th>
              <th>SELLER</th>
              <th>TRADE VALUE</th>
              <th>FEE COLLECTED</th>
              <th>RUNNING TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let running = 0
              return [...trades].reverse().slice(0, 20).map((trade) => {
                running += parseFloat(trade.fee)
                return (
                  <tr key={trade.id}>
                    <td style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>
                      {new Date(trade.created_at).toLocaleTimeString()}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>{trade.buyer_ticker}</td>
                    <td style={{ color: 'var(--text2)' }}>{trade.seller_ticker}</td>
                    <td style={{ color: 'var(--blue)', fontWeight: 600 }}>${parseFloat(trade.total_cost).toFixed(2)}</td>
                    <td style={{ color: 'var(--green)', fontWeight: 600 }}>${parseFloat(trade.fee).toFixed(4)}</td>
                    <td style={{ color: 'var(--text)', fontWeight: 700 }}>${running.toFixed(4)}</td>
                  </tr>
                )
              })
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}