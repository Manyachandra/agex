import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { socket } from './lib/socket'
import { AuthProvider } from './context/AuthContext'
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

function asTreasury(data) {
  return data && typeof data === 'object' && !data.error ? data : null
}

/** Load desk KPIs + dashboard panels together so the UI never paints empty. */
async function loadDeskBootstrap() {
  const [agRes, trRes, acRes, ttRes] = await Promise.all([
    fetch(`${API_BASE}/api/agents`).then((r) => r.json()).catch(() => []),
    fetch(`${API_BASE}/api/treasury`).then((r) => r.json()).catch(() => null),
    fetch(`${API_BASE}/api/activity?limit=40&types=real_trade,fee`).then((r) => r.json()).catch(() => []),
    fetch(`${API_BASE}/api/token-trades?limit=200&fields=slim`).then((r) => r.json()).catch(() => []),
  ])
  return {
    agents: Array.isArray(agRes) ? agRes : [],
    treasury: asTreasury(trRes),
    activity: asArray(acRes).filter((item) => ['real_trade', 'fee'].includes(item.action_type)),
    tokenTrades: asArray(ttRes),
  }
}

function DeskBootScreen({ error }) {
  return (
    <div className="desk-boot" role="status" aria-live="polite">
      <img src="/agex.webp" alt="" className="desk-boot-mark" />
      <div className="desk-boot-title">Agex</div>
      <div className="desk-boot-sub">
        {error ? 'Could not reach the desk. Retrying…' : 'Loading live desk…'}
      </div>
      <div className="desk-boot-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  )
}

function AppLayout() {
  const [agents, setAgents] = useState([])
  const [treasury, setTreasury] = useState(null)
  const [activity, setActivity] = useState([])
  const [tokenTrades, setTokenTrades] = useState([])
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let retryTimer = null

    const boot = () => {
      loadDeskBootstrap()
        .then((snap) => {
          if (cancelled) return
          setAgents(snap.agents)
          setTreasury(snap.treasury)
          setActivity(snap.activity)
          setTokenTrades(snap.tokenTrades)
          setBootError(false)
          setReady(true)
          document.getElementById('agex-boot')?.remove()
        })
        .catch(() => {
          if (cancelled) return
          setBootError(true)
          retryTimer = setTimeout(boot, 2000)
        })
    }

    boot()

    const onConnect = () => {}
    const onDisconnect = () => {}
    const onUpdate = (data) => {
      if (data.agents != null && data.treasury != null) {
        setAgents(asArray(data.agents))
        setTreasury(data.treasury)
        return
      }
      if (data.agents != null) setAgents(asArray(data.agents))
      if (data.treasury != null) setTreasury(data.treasury)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('exchange-update', onUpdate)
    if (!socket.connected) socket.connect()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('exchange-update', onUpdate)
    }
  }, [])

  if (!ready) {
    return <DeskBootScreen error={bootError} />
  }

  return (
    <div className="terminal-root fade-in">
      <Ticker agents={agents} />
      <TopNav />
      <main className="terminal-main">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                agents={agents}
                treasury={treasury}
                initialActivity={activity}
                initialTokenTrades={tokenTrades}
              />
            }
          />
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
