import AgentAvatar from './AgentAvatar'

function tokenInvestedEth(agent) {
  const h = agent?.token_holdings
  if (!h || typeof h !== 'object') return 0
  return Object.values(h).reduce((s, t) => s + parseFloat(t?.eth_in || 0), 0)
}

function tokensHeldCount(agent) {
  const h = agent?.token_holdings
  if (!h || typeof h !== 'object') return 0
  return Object.values(h).filter((t) => t && parseFloat(t.amount) > 0).length
}

export default function Ticker({ agents: liveAgents }) {
  const agents = Array.isArray(liveAgents) ? liveAgents : []

  const ethUsd = (() => {
    const ref = agents.find((a) => parseFloat(a.real_eth || 0) > 0 && parseFloat(a.real_usd || 0) > 0)
    return ref ? parseFloat(ref.real_usd) / parseFloat(ref.real_eth) : 0
  })()

  const items = agents.map(a => ({
    type: 'agent',
    ticker: a.ticker,
    avatarUrl: a.avatar_url,
    portfolioUsd: parseFloat(a.real_usd || 0) + tokenInvestedEth(a) * ethUsd,
    eth: parseFloat(a.real_eth || 0),
    tokens: tokensHeldCount(a),
  }))

  return (
    <div style={{
      background: '#FFFFFF',
      borderBottom: '1px solid #E4E7EF',
      height: '36px',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      boxShadow: '0 4px 12px rgba(28,39,76,0.04)'
    }}>
      <div style={{
        display: 'flex',
        animation: 'ticker-scroll 500s linear infinite',
        whiteSpace: 'nowrap',
        gap: '48px',
        padding: '0 24px'
      }}>
        {[...items, ...items].map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: "'Tinos', serif",
            fontSize: '0.72rem'
          }}>
            {item.type === 'agent' ? (
              <>
                <AgentAvatar ticker={item.ticker} avatarUrl={item.avatarUrl} size="xs" style={{ border: 'none' }} />
                <span style={{ color: '#5B6CFF', fontWeight: 600 }}>{item.ticker}</span>
                <span style={{ color: '#1C274C' }}>${item.portfolioUsd.toFixed(2)}</span>
                <span style={{ color: '#18B368', fontWeight: 600 }}>{item.eth.toFixed(5)} ETH</span>
                <span style={{ color: '#FFB547', fontWeight: 600 }}>{item.tokens} token{item.tokens !== 1 ? 's' : ''}</span>
                <span style={{ color: '#D0D5E2' }}>|</span>
              </>
            ) : (
              <span style={{ color: '#8B93A7' }}>{item.label}</span>
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