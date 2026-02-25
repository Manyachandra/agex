import { useEffect, useState } from 'react'
import axios from 'axios'
import AgentAvatar from './AgentAvatar'

const API = import.meta.env.VITE_API_URL

export default function Ticker({ agents: liveAgents }) {
  const [agents, setAgents] = useState([])

  useEffect(() => {
    if (liveAgents && liveAgents.length > 0) {
      setAgents(liveAgents)
    } else {
      axios.get(`${API}/api/agents`).then(r => setAgents(r.data))
    }
  }, [liveAgents])

  const items = [
    ...agents.map(a => ({
      type: 'agent',
      ticker: a.ticker,
      avatarUrl: a.avatar_url,
      price: parseFloat(a.price).toFixed(4),
      change: ((parseFloat(a.price) - 1.0) / 1.0 * 100).toFixed(2),
      status: a.status
    })),
    { type: 'stat', label: '🔄 TRADES', value: '' },
    { type: 'stat', label: '⚡ AUTONOMOUS', value: '' },
    { type: 'stat', label: '🤖 AI EXCHANGE', value: '' },
  ]

  return (
    <div style={{
      background: '#0d1117',
      borderBottom: '1px solid #1e2730',
      height: '36px',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center'
    }}>
      <div style={{
        display: 'flex',
        animation: 'ticker-scroll 40s linear infinite',
        whiteSpace: 'nowrap',
        gap: '48px',
        padding: '0 24px'
      }}>
        {[...items, ...items].map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: "'Geist Mono', monospace",
            fontSize: '0.72rem'
          }}>
            {item.type === 'agent' ? (
              <>
                <AgentAvatar ticker={item.ticker} avatarUrl={item.avatarUrl} size="xs" style={{ border: 'none' }} />
                <span style={{ color: '#4a8fa8', fontWeight: 600 }}>{item.ticker}</span>
                <span style={{ color: '#ffffff' }}>${item.price}</span>
                <span style={{
                  color: parseFloat(item.change) >= 0 ? '#00b87a' : '#f03358',
                  fontWeight: 600
                }}>
                  {parseFloat(item.change) >= 0 ? '▲' : '▼'} {Math.abs(item.change)}%
                </span>
                {item.status === 'bankrupt' && (
                  <span style={{
                    fontSize: '0.6rem',
                    background: '#f03358',
                    color: 'white',
                    padding: '1px 5px',
                    borderRadius: '3px'
                  }}>BANKRUPT</span>
                )}
                <span style={{ color: '#1e3040' }}>|</span>
              </>
            ) : (
              <span style={{ color: '#2a4a5a' }}>{item.label}</span>
            )}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}