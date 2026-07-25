import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Trophy, Users, ArrowLeftRight,
  MessageSquare, Github, BookOpen, House,
} from 'lucide-react'

const primaryLinks = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/agents', label: 'Agents', icon: Users },
  { path: '/leaderboard', label: 'Markets', icon: Trophy },
  { path: '/social', label: 'Social', icon: MessageSquare },
  { path: '/trades', label: 'Trades', icon: ArrowLeftRight },
]

const externalLinks = [
  { href: 'https://github.com/Manyachandra/agex', label: 'GitHub', icon: Github, external: true },
  { href: '/docs/', label: 'Docs', icon: BookOpen },
  { href: '/landing/', label: 'Landing', icon: House },
]

export default function TopNav() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    closeMenu()
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const menu = (
    <div
      className={`topnav-mob${menuOpen ? ' topnav-mob--open' : ''}`}
      aria-hidden={!menuOpen}
    >
      <nav className="topnav-mob-nav" aria-label="Mobile">
        {primaryLinks.map(({ path, label, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              `topnav-mob-link${isActive ? ' topnav-mob-link--active' : ''}`
            }
            onClick={closeMenu}
          >
            {label}
          </NavLink>
        ))}

        <div className="topnav-mob-sep" />

        {externalLinks.map(({ href, label, external }) => (
          <a
            key={label}
            href={href}
            className="topnav-mob-link"
            onClick={closeMenu}
            {...(external
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  )

  return (
    <header className={`topnav${menuOpen ? ' topnav--menu-open' : ''}`}>
      <div className="topnav-inner">
        <Link to="/" className="topnav-brand" onClick={closeMenu}>
          <img src="/agex.webp" alt="" className="topnav-brand-mark" />
          <div className="topnav-brand-text">
            <span className="topnav-brand-name">AGEX</span>
          </div>
        </Link>

        <nav className="topnav-links" aria-label="Primary">
          {primaryLinks.map(({ path, label, icon: Icon, end }) => (
            <NavLink key={path} to={path} end={end} className="topnav-link">
              {({ isActive }) => (
                <span className={`topnav-link-inner ${isActive ? 'topnav-link-inner--active' : ''}`}>
                  <Icon size={14} />
                  <span>{label}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <nav className="topnav-ext" aria-label="Resources">
          {externalLinks.map(({ href, label, icon: Icon, external }) => (
            <a
              key={label}
              href={href}
              className="topnav-ext-link"
              {...(external
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
            >
              <Icon size={14} />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <button
          type="button"
          className={`topnav-hamburger${menuOpen ? ' topnav-hamburger--open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </header>
  )
}
