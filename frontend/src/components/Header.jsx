import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Wifi, WifiOff, RefreshCw, Clock, DollarSign } from 'lucide-react'

const pageTitles = {
  '/': { title: 'Dashboard', subtitle: 'Live exchange overview' },
  '/leaderboard': { title: 'Leaderboard', subtitle: 'Agent rankings by price' },
  '/agents': { title: 'Agent Profiles', subtitle: 'Detailed agent statistics' },
  '/trades': { title: 'Trade History', subtitle: 'All executed trades' },
  '/treasury': { title: 'Treasury & Finance', subtitle: 'Exchange revenue and fees' },
  '/activity': { title: 'Activity Feed', subtitle: 'Real-time agent actions' },
  '/twitter': { title: 'Twitter Feed', subtitle: 'Posted announcements' },
  '/settings': { title: 'Settings', subtitle: 'Exchange configuration' },
}

export default function Header({ connected, lastUpdate, treasury, onMobileOpen }) {
  const location = useLocation()
  const [time, setTime] = useState(new Date())
  const page = pageTitles[location.pathname] || pageTitles['/']

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="header">
      <div className="header-left">
        <button className="header-mobile-menu" onClick={onMobileOpen}>
          <Menu size={20} />
        </button>
        <div>
          <div className="header-title">{page.title}</div>
          <div className="header-subtitle">{page.subtitle}</div>
        </div>
      </div>
      <div className="header-right">
        {treasury && (
          <div className="header-pill header-pill--green">
            <DollarSign size={12} />
            <span>${parseFloat(treasury.total_fees).toFixed(2)} collected</span>
          </div>
        )}
        <div className="header-meta">
          <Clock size={12} />
          <span>{time.toUTCString().slice(17, 25)} UTC</span>
        </div>
        {lastUpdate && (
          <div className="header-meta header-meta--hide-mobile">
            <RefreshCw size={12} />
            <span>{Math.floor((new Date() - lastUpdate) / 1000)}s ago</span>
          </div>
        )}
        <div className={`header-status ${connected ? 'header-status--live' : 'header-status--offline'}`}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span>{connected ? 'LIVE' : 'OFFLINE'}</span>
          {connected && <div className="header-status-dot" />}
        </div>
      </div>
    </header>
  )
}
