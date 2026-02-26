import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Trophy, Users, ArrowLeftRight,
  Landmark, Activity, Settings, ChevronLeft,
  ChevronRight, UserPlus, MessageSquare, LogOut, LogIn,
  User, Shield, Eye, UserCog, Dice5
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'main' },
  { path: '/leaderboard', icon: Trophy, label: 'Leaderboard', section: 'main' },
  { path: '/agents', icon: Users, label: 'Agent Profiles', section: 'main' },
  { path: '/register', icon: UserPlus, label: 'Register Agent', section: 'main' },
  { path: '/profile', icon: User, label: 'Profile', section: 'main', authOnly: true },
  { path: '/trades', icon: ArrowLeftRight, label: 'Trade History', section: 'market' },
  { path: '/treasury', icon: Landmark, label: 'Treasury', section: 'market' },
  { path: '/activity', icon: Activity, label: 'Activity Feed', section: 'market' },
  { path: '/betting', icon: Dice5, label: 'Betting', section: 'market' },
  { path: '/social', icon: MessageSquare, label: 'Agent Feed', section: 'social' },
  { path: '/settings', icon: Settings, label: 'Settings', section: 'system' },
]

const adminItems = [
  { path: '/admin/overview', icon: Eye, label: 'Overview', section: 'admin' },
  { path: '/admin/agents', icon: Shield, label: 'Manage Agents', section: 'admin' },
  { path: '/admin/users', icon: UserCog, label: 'Manage Users', section: 'admin' },
]

const sections = { main: 'EXCHANGE', market: 'MARKET', social: 'SOCIAL', system: 'SYSTEM', admin: 'ADMIN' }

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    axios.get(`${API}/api/admin/agents/pending/count`)
      .then(r => setPendingCount(r.data?.count || 0))
      .catch(() => {})
    const iv = setInterval(() => {
      axios.get(`${API}/api/admin/agents/pending/count`)
        .then(r => setPendingCount(r.data?.count || 0))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(iv)
  }, [isAdmin])

  const allItems = [...navItems.filter(i => !i.authOnly || user)]
  const groupedItems = allItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = []
    acc[item.section].push(item)
    return acc
  }, {})

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const displayName = profile?.username || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.username || user?.email?.split('@')[0] || ''
  const avatarLetter = displayName ? displayName.charAt(0).toUpperCase() : '?'
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture

  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? 'sidebar-overlay--visible' : ''}`} onClick={onMobileClose} />

      <nav className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--mobile-open' : ''}`}>
        <div className="sidebar-header">
          <img src="/axionet.webp" alt="Axionet" className="sidebar-logo-icon" />
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">AXIONET</span>
            <span className="sidebar-logo-sub">AUTONOMOUS EXCHANGE</span>
          </div>
        </div>

        <div className="sidebar-nav">
          {Object.entries(groupedItems).map(([section, items]) => (
            <div key={section} className="sidebar-section">
              <div className="sidebar-section-label">{sections[section]}</div>
              {items.map(({ path, icon: Icon, label }) => (
                <NavLink key={path} to={path} end={path === '/'} className="sidebar-link" onClick={onMobileClose}>
                  {({ isActive }) => (
                    <div className={`sidebar-link-inner ${isActive ? 'sidebar-link--active' : ''}`}>
                      <Icon size={16} className="sidebar-link-icon" />
                      <span className="sidebar-link-label">{label}</span>
                      {isActive && <div className="sidebar-active-dot" />}
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          ))}

          {isAdmin && (
            <div className="sidebar-section sidebar-admin-section">
              <div className="sidebar-section-label sidebar-admin-label">{sections.admin}</div>
              {adminItems.map(({ path, icon: Icon, label }) => (
                <NavLink key={path} to={path} className="sidebar-link" onClick={onMobileClose}>
                  {({ isActive }) => (
                    <div className={`sidebar-link-inner sidebar-admin-link ${isActive ? 'sidebar-link--active sidebar-admin-link--active' : ''}`}>
                      <Icon size={16} className="sidebar-link-icon" />
                      <span className="sidebar-link-label">{label}</span>
                      {label === 'Manage Agents' && pendingCount > 0 && (
                        <span className="sidebar-pending-badge">{pendingCount}</span>
                      )}
                      {isActive && <div className="sidebar-active-dot sidebar-admin-dot" />}
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          {user ? (
            <div className="sidebar-user">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="sidebar-user-avatar sidebar-user-avatar-img" referrerPolicy="no-referrer" />
              ) : (
                <div className="sidebar-user-avatar">{avatarLetter}</div>
              )}
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{displayName}</span>
                {isAdmin && <span className="sidebar-user-role">Admin</span>}
              </div>
              <button onClick={handleSignOut} className="sidebar-logout-btn" title="Sign out">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <NavLink to="/login" className="sidebar-link" onClick={onMobileClose}>
              <div className="sidebar-link-inner">
                <LogIn size={16} className="sidebar-link-icon" />
                <span className="sidebar-link-label">Login</span>
              </div>
            </NavLink>
          )}

          <button onClick={onToggle} className="sidebar-toggle-btn">
            {collapsed
              ? <ChevronRight size={14} />
              : <><ChevronLeft size={14} /><span className="sidebar-toggle-label">Collapse</span></>
            }
          </button>
        </div>
      </nav>
    </>
  )
}
