import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Trophy, Users, ArrowLeftRight,
  Landmark, Activity, Twitter, Settings, ChevronLeft,
  ChevronRight, Zap
} from 'lucide-react'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'main' },
  { path: '/leaderboard', icon: Trophy, label: 'Leaderboard', section: 'main' },
  { path: '/agents', icon: Users, label: 'Agent Profiles', section: 'main' },
  { path: '/trades', icon: ArrowLeftRight, label: 'Trade History', section: 'market' },
  { path: '/treasury', icon: Landmark, label: 'Treasury', section: 'market' },
  { path: '/activity', icon: Activity, label: 'Activity Feed', section: 'market' },
  { path: '/twitter', icon: Twitter, label: 'Twitter Feed', section: 'social' },
  { path: '/settings', icon: Settings, label: 'Settings', section: 'system' },
]

const sections = { main: 'EXCHANGE', market: 'MARKET', social: 'SOCIAL', system: 'SYSTEM' }

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const groupedItems = navItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = []
    acc[item.section].push(item)
    return acc
  }, {})

  return (
    <>
      <div
        className={`sidebar-overlay ${mobileOpen ? 'sidebar-overlay--visible' : ''}`}
        onClick={onMobileClose}
      />

      <nav className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--mobile-open' : ''}`}>
        <div className="sidebar-header">
          <Zap size={18} color="#00b87a" fill="#00b87a" className="sidebar-logo-icon" />
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">AGENT ECONOMY</span>
            <span className="sidebar-logo-sub">AUTONOMOUS EXCHANGE</span>
          </div>
        </div>

        <div className="sidebar-nav">
          {Object.entries(groupedItems).map(([section, items]) => (
            <div key={section} className="sidebar-section">
              <div className="sidebar-section-label">{sections[section]}</div>
              {items.map(({ path, icon: Icon, label }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/'}
                  className="sidebar-link"
                  onClick={onMobileClose}
                >
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
        </div>

        <div className="sidebar-footer">
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
