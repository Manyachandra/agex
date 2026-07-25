import { NavLink, useNavigate } from 'react-router-dom'
import {
  UserPlus, User, Landmark, Activity, Settings,
  LogOut, Wallet
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const dockItems = [
  { path: '/register', icon: UserPlus, label: 'Register' },
  { path: '/treasury', icon: Landmark, label: 'Treasury' },
  { path: '/activity', icon: Activity, label: 'Activity' },
  { path: '/profile', icon: User, label: 'Profile', authOnly: true },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export default function BottomDock() {
  const { user, signOut, connectWallet } = useAuth()
  const navigate = useNavigate()

  const items = dockItems.filter((i) => !i.authOnly || user)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <nav className="dock" aria-label="Secondary">
      <div className="dock-inner">
        <div className="dock-group">
          {items.map(({ path, icon: Icon, label }) => (
            <NavLink key={path} to={path} className="dock-item">
              {({ isActive }) => (
                <span className={`dock-item-inner ${isActive ? 'dock-item-inner--active' : ''}`}>
                  <Icon size={16} />
                  <span className="dock-label">{label}</span>
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="dock-group dock-group--auth">
          {user ? (
            <button type="button" className="dock-item dock-btn" onClick={handleSignOut} title="Disconnect wallet">
              <span className="dock-item-inner">
                <LogOut size={16} />
                <span className="dock-label">Disconnect</span>
              </span>
            </button>
          ) : (
            <button type="button" className="dock-item dock-btn" onClick={connectWallet} title="Connect wallet">
              <span className="dock-item-inner">
                <Wallet size={16} />
                <span className="dock-label">Connect</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
