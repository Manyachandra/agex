import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { Activity, Filter, Zap, ArrowLeftRight, Skull, Crown } from 'lucide-react'
import AgentAvatar from '../components/AgentAvatar'

const API = import.meta.env.VITE_API_URL
const AGENT_COLORS = {
  RAVI: '#00b87a', ZEUS: '#f5a623',
  NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358'
}

const ACTION_ICONS = {
  task: Zap,
  trade: ArrowLeftRight,
  bankruptcy: Skull,
  dominant: Crown
}

export default function ActivityFeed() {
  const [activity, setActivity] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const feedRef = useRef(null)

  useEffect(() => {
    axios.get(`${API}/api/activity?limit=200`)
      .then(r => setActivity(r.data || []))
      .catch(() => {})

    const interval = setInterval(() => {
      axios.get(`${API}/api/activity?limit=200`)
        .then(r => setActivity(r.data || []))
        .catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const agents = ['ALL', 'ZEUS', 'RAVI', 'NOVA', 'BRAHMA', 'KIRA']
  const types = ['ALL', 'task', 'trade', 'bankruptcy']

  const filtered = activity.filter(a => {
    const agentMatch = filter === 'ALL' || a.agent_ticker === filter
    const typeMatch = typeFilter === 'ALL' || a.action_type === typeFilter
    return agentMatch && typeMatch
  })

  const taskCount = activity.filter(a => a.action_type === 'task' && !a.action.includes('failed')).length
  const failCount = activity.filter(a => a.action.includes('failed')).length
  const tradeCount = activity.filter(a => a.action_type === 'trade').length
  const bankruptCount = activity.filter(a => a.action_type === 'bankruptcy').length

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Activity Feed</div>
        <div className="page-subtitle">Every action taken by every agent in real time</div>
      </div>

      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Successful Tasks', value: taskCount, color: 'var(--green)' },
          { label: 'Failed Tasks', value: failCount, color: 'var(--red)' },
          { label: 'Trades Made', value: tradeCount, color: 'var(--blue)' },
          { label: 'Bankruptcies', value: bankruptCount, color: 'var(--gold)' },
        ].map((s, i) => (
          <div key={i} className="card">
            <div style={{ fontSize: '0.6rem', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={14} color="var(--text3)" />
        {agents.map(a => (
          <button key={a} onClick={() => setFilter(a)} style={{
            background: filter === a ? (AGENT_COLORS[a] || 'var(--text)') : 'var(--bg2)',
            color: filter === a ? '#fff' : 'var(--text2)',
            border: `1px solid ${filter === a ? (AGENT_COLORS[a] || 'var(--text)') : 'var(--border)'}`,
            padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
            fontFamily: "'Geist Mono', monospace", fontSize: '0.7rem', fontWeight: 600
          }}>{a}</button>
        ))}
        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
        {types.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            background: typeFilter === t ? 'var(--text)' : 'var(--bg2)',
            color: typeFilter === t ? '#fff' : 'var(--text2)',
            border: `1px solid ${typeFilter === t ? 'var(--text)' : 'var(--border)'}`,
            padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
            fontFamily: "'Geist Mono', monospace", fontSize: '0.7rem', fontWeight: 600
          }}>{t.toUpperCase()}</button>
        ))}
        <span style={{ fontSize: '0.7rem', color: 'var(--text3)', marginLeft: 'auto' }}>
          {filtered.length} events
        </span>
      </div>

      {/* Feed */}
      <div className="card" ref={feedRef} style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {filtered.map((item, i) => {
          const Icon = ACTION_ICONS[item.action_type] || Activity
          const isSuccess = item.action.includes('completed') || item.action.includes('bought')
          const isFail = item.action.includes('failed') || item.action.includes('BANKRUPT')
          return (
            <div key={item.id} style={{
              display: 'flex',
              gap: '12px',
              padding: '12px 0',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'flex-start',
              animation: i === 0 ? 'fadeIn 0.3s ease' : 'none'
            }}>
              <div style={{
                background: isFail ? 'var(--red-bg)' : isSuccess ? 'var(--green-bg)' : 'var(--bg3)',
                padding: '8px',
                borderRadius: '8px',
                flexShrink: 0
              }}>
                <Icon size={14} color={isFail ? 'var(--red)' : isSuccess ? 'var(--green)' : 'var(--text3)'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '3px', flexWrap: 'wrap' }}>
                  <span style={{
                    background: (AGENT_COLORS[item.agent_ticker] || '#888') + '20',
                    color: AGENT_COLORS[item.agent_ticker] || '#888',
                    padding: '2px 8px', borderRadius: '4px',
                    fontSize: '0.65rem', fontWeight: 700
                  }}>
                    {item.agent_ticker}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>
                    {item.action_type?.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{item.action}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {parseFloat(item.amount) > 0 && (
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--green)' }}>
                    +${parseFloat(item.amount).toFixed(2)}
                  </div>
                )}
                <div style={{ fontSize: '0.62rem', color: 'var(--text3)', marginTop: '2px' }}>
                  {new Date(item.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>No activity found</div>
        )}
      </div>
    </div>
  )
}