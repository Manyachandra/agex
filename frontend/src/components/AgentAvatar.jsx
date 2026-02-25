const PRESETS = { RAVI: '#00b87a', ZEUS: '#f5a623', NOVA: '#7c3aed', BRAHMA: '#2563eb', KIRA: '#f03358' }

function getColor(ticker) {
  if (!ticker) return '#666'
  if (PRESETS[ticker]) return PRESETS[ticker]
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = (h + ticker.charCodeAt(i) * 47) % 360
  return `hsl(${h}, 60%, 50%)`
}

const SIZES = { xs: 20, sm: 24, md: 36, lg: 48, xl: 80 }

export default function AgentAvatar({ ticker, avatarUrl, size = 'md', style: extraStyle }) {
  const px = SIZES[size] || SIZES.md
  const color = getColor(ticker)
  const fontSize = px < 28 ? '0.45rem' : px < 40 ? '0.55rem' : px < 60 ? '0.7rem' : '1.1rem'
  const initials = ticker ? ticker.slice(0, 2) : '?'

  const baseStyle = {
    width: px, height: px, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `2px solid ${color}40`,
    overflow: 'hidden',
    ...extraStyle,
  }

  if (avatarUrl) {
    return (
      <div style={baseStyle}>
        <img src={avatarUrl} alt={ticker} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
      </div>
    )
  }

  return (
    <div style={{
      ...baseStyle,
      background: color,
      color: '#fff',
      fontFamily: "'Syne', sans-serif",
      fontWeight: 800,
      fontSize,
    }}>
      {initials}
    </div>
  )
}

export { getColor }
