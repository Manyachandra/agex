import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Ticker from './components/Ticker'
import Dashboard from './pages/Dashboard'
import Leaderboard from './pages/Leaderboard'
import AgentProfiles from './pages/AgentProfiles'
import TradeHistory from './pages/TradeHistory'
import Treasury from './pages/Treasury'
import ActivityFeed from './pages/ActivityFeed'
import TwitterFeed from './pages/TwitterFeed'
import Settings from './pages/Settings'
import './App.css'

const socket = io(import.meta.env.VITE_API_URL, {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
})

export default function App() {
  const [agents, setAgents] = useState([])
  const [treasury, setTreasury] = useState(null)
  const [connected, setConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1024)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onUpdate = (data) => {
      setAgents(data.agents)
      setTreasury(data.treasury)
      setLastUpdate(new Date())
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('exchange-update', onUpdate)

    if (socket.connected) setConnected(true)
    if (!socket.connected) socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('exchange-update', onUpdate)
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth
      if (w < 768) {
        setMobileOpen(false)
      } else if (w < 1024) {
        setSidebarCollapsed(true)
        setMobileOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleMobileClose = useCallback(() => setMobileOpen(false), [])
  const handleMobileOpen = useCallback(() => setMobileOpen(true), [])

  return (
    <BrowserRouter>
      <div className={`app-root ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          mobileOpen={mobileOpen}
          onMobileClose={handleMobileClose}
        />
        <div className="app-main">
          <Ticker agents={agents} />
          <Header
            connected={connected}
            lastUpdate={lastUpdate}
            treasury={treasury}
            onMobileOpen={handleMobileOpen}
          />
          <div className="page-content">
            <Routes>
              <Route path="/" element={<Dashboard agents={agents} treasury={treasury} />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/agents" element={<AgentProfiles />} />
              <Route path="/trades" element={<TradeHistory />} />
              <Route path="/treasury" element={<Treasury />} />
              <Route path="/activity" element={<ActivityFeed />} />
              <Route path="/twitter" element={<TwitterFeed />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  )
}
