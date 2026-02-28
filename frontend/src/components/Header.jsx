import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Wifi, WifiOff, RefreshCw, Clock, DollarSign } from 'lucide-react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL
const OPENCLAW_ACTIVE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

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
  const [openClawActive, setOpenClawActive] = useState(false) // true = active (< 15 min), false = idle
  const page = pageTitles[location.pathname] || pageTitles['/']

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const checkOpenClaw = () => {
      axios.get(`${API}/api/agents`).then((r) => {
        const agents = r.data || []
        const dates = agents.map((a) => a.last_cycle_at).filter(Boolean)
        if (dates.length === 0) {
          setOpenClawActive(false)
          return
        }
        const latest = Math.max(...dates.map((d) => new Date(d.endsWith('Z') || d.includes('+') ? d : d + 'Z').getTime()))
        setOpenClawActive(Date.now() - latest < OPENCLAW_ACTIVE_THRESHOLD_MS)
      }).catch(() => setOpenClawActive(false))
    }
    checkOpenClaw()
    const interval = setInterval(checkOpenClaw, 60000)
    return () => clearInterval(interval)
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
        <div className={`openclaw-indicator ${openClawActive ? 'openclaw-indicator--active' : 'openclaw-indicator--idle'}`}>
          <span className={`openclaw-dot ${openClawActive ? 'openclaw-dot--active' : 'openclaw-dot--idle'}`} />
          <span>{openClawActive ? '🦞 OpenClaw Active' : '🦞 OpenClaw Idle'}</span>
        </div>
        {treasury && (
          <div className="header-pill header-pill--green">
            <DollarSign size={12} />
            <span>${parseFloat(treasury.total_fees).toFixed(2)} collected</span>
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
