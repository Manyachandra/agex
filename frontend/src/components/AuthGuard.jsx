import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader } from 'lucide-react'

export function AuthGuard({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text3)' }}>
        <Loader size={24} className="auth-spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return children
}

export function AdminGuard({ children, fallback }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text3)' }}>
        <Loader size={24} className="auth-spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (profile?.role !== 'admin') {
    if (fallback) return fallback
    return <Navigate to="/" replace />
  }

  return children
}
