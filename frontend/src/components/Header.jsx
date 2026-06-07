import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Wifi, WifiOff, RefreshCw, Clock, Wallet, AlertTriangle } from 'lucide-react'
import axios from 'axios'
import { ConnectButton } from '@rainbow-me/rainbowkit'

const API = import.meta.env.VITE_API_URL
const TRADING_ACTIVE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

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
  const [tradingEnabled, setTradingEnabled] = useState(false)
  const [tradingLive, setTradingLive] = useState(false)
  const page = pageTitles[location.pathname] || pageTitles['/']

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const checkTrading = () => {
      axios.get(`${API}/api/real-trading/status`).then((r) => {
        const s = r.data || {}
        setTradingEnabled(!!s.enabled)
        if (s.lastRunAt) {
          const last = new Date(s.lastRunAt).getTime()
          setTradingLive(!!s.enabled && Date.now() - last < TRADING_ACTIVE_THRESHOLD_MS)
        } else {
          setTradingLive(false)
        }
      }).catch(() => { setTradingEnabled(false); setTradingLive(false) })
    }
    checkTrading()
    const interval = setInterval(checkTrading, 60000)
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
      <div className={`hermes-indicator ${tradingEnabled ? 'hermes-indicator--active' : 'hermes-indicator--idle'}`}>
  <span className={`hermes-dot ${tradingEnabled ? 'hermes-dot--active' : 'hermes-dot--idle'}`} />
  <span className="hermes-emoji">⛓️</span>
  <span className="hermes-label">{tradingEnabled ? (tradingLive ? 'Trading Live' : 'Trading On') : 'Trading Off'}</span>
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
