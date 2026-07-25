import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { socket } from './lib/socket'
import { AuthProvider, useAuth } from './context/AuthContext'
import TopNav from './components/TopNav'
import BottomDock from './components/BottomDock'
import Ticker from './components/Ticker'
import Dashboard from './pages/Dashboard'
import Leaderboard from './pages/Leaderboard'
import AgentProfiles from './pages/AgentProfiles'
import TradeHistory from './pages/TradeHistory'
import Treasury from './pages/Treasury'
import ActivityFeed from './pages/ActivityFeed'
import Register from './pages/Register'
import SocialFeed from './pages/SocialFeed'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import { asArray } from './lib/api'
import { API_BASE } from './lib/config'

function AppLayout() {
  const { loading: authLoading } = useAuth()
  const [agents, setAgents] = useState([])
  const [treasury, setTreasury] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onUpdate = async (data) => {
      if (data.agents != null && data.treasury != null) {
        setAgents(asArray(data.agents))
        setTreasury(data.treasury)
      } else {
        try {
          const [agRes, trRes] = await Promise.all([
            fetch(`${API_BASE}/api/agents`).then((r) => r.json()),
            fetch(`${API_BASE}/api/treasury`).then((r) => r.json())
          ])
          setAgents(Array.isArray(agRes) ? agRes : [])
          setTreasury(trRes && typeof trRes === 'object' ? trRes : null)
        } catch {
          // keep existing state
        }
      }
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

  if (authLoading) return null

  return (
    <div className="terminal-root">
      <Ticker agents={agents} />
      <TopNav />
      <main className="terminal-main">
        <Routes>
          <Route path="/" element={<Dashboard agents={agents} treasury={treasury} />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/agents" element={<AgentProfiles />} />
          <Route path="/register" element={<Register />} />
          <Route path="/trades" element={<TradeHistory />} />
          <Route path="/treasury" element={<Treasury />} />
          <Route path="/activity" element={<ActivityFeed />} />
          <Route path="/social" element={<SocialFeed />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin/*" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/signup" element={<Navigate to="/" replace />} />
          <Route path="/auth/callback" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomDock />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  )
}
