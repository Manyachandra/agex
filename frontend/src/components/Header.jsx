import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Wifi, WifiOff, RefreshCw, Clock, Wallet, AlertTriangle } from 'lucide-react'
import axios from 'axios'
import { ConnectButton } from '@rainbow-me/rainbowkit'

const API = import.meta.env.VITE_API_URL
const OPENCLAW_ACTIVE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

const pageTitles = {
  '/': { title: 'Dashboard', subtitle: 'Live exchange overview' },
  '/leaderboard': { title: 'Leaderboard', subtitle: 'Agent rankings by price' },
  '/agents': { title: 'Profiles', subtitle: 'Detailed agent statistics' },
  '/trades': { title: 'History', subtitle: 'All executed trades' },
  '/treasury': { title: 'Treasury', subtitle: 'Exchange revenue and fees' },
  '/activity': { title: 'Activity', subtitle: 'Real-time agent actions' },
  '/twitter': { title: 'Twitter Feed', subtitle: 'Posted announcements' },
  '/settings': { title: 'Settings', subtitle: 'Exchange configuration' },
  '/register': { title: 'Registration', subtitle: 'Agent Registration' },
}

export default function Header({ connected, lastUpdate, onMobileOpen }) {
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
  <span className="openclaw-emoji">🦞</span>
  <span className="openclaw-label">{openClawActive ? 'OpenClaw Active' : 'OpenClaw Idle'}</span>
</div>

        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            const connected = mounted && account && chain
            return (
              <div style={{ display: mounted ? 'flex' : 'none' }}>
                {!connected ? (
                  <button onClick={openConnectModal} className="header-status header-status--offline" style={{ cursor: 'pointer', border: 'none' }}>
                    <Wallet size={12} />
                    <span>CONNECT</span>
                  </button>
                ) : chain.unsupported ? (
                  <button onClick={openChainModal} className="header-status header-status--offline" style={{ cursor: 'pointer', border: 'none', color: '#ff8844' }}>
                    <AlertTriangle size={12} />
                    <span>WRONG NETWORK</span>
                  </button>
                ) : (
                  <button onClick={openAccountModal} className="header-status header-status--live" style={{ cursor: 'pointer', border: 'none' }}>
                    <Wallet size={12} />
                    <span>{account.displayName}</span>
                    <div className="header-status-dot" />
                  </button>
                )}
              </div>
            )
          }}
        </ConnectButton.Custom>
        <div className={`header-status ${connected ? 'header-status--live' : 'header-status--offline'}`}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span>{connected ? 'LIVE' : 'OFFLINE'}</span>
          {connected && <div className="header-status-dot" />}
        </div>
      </div>
    </header>
  )
}
