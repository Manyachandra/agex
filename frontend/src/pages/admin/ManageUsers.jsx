import { useState, useEffect } from 'react'
import axios from 'axios'
import { Shield, ShieldOff, Ban, Loader } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

export default function ManageUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => {
    axios.get(`${API}/api/admin/users`)
      .then(r => setUsers(r.data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [])

  const updateRole = async (id, role) => {
    setActionLoading(p => ({ ...p, [id]: role }))
    try {
      const r = await axios.put(`${API}/api/admin/users/${id}/role`, { role })
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role: r.data.role } : u))
    } catch {}
    setActionLoading(p => ({ ...p, [id]: null }))
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Manage Users</div>
        <div className="page-subtitle">User roles and permissions</div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr><th>Username</th><th>Email</th><th>Role</th><th>Joined</th><th>Agents</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>Loading...</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>No users</td></tr>}
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.username}</strong></td>
                  <td style={{ fontSize: '0.68rem' }}>{u.email}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-gold' : u.role === 'banned' ? 'badge-red' : 'badge-blue'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ fontWeight: 600 }}>{u.agents_count}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {u.role !== 'admin' && (
                        <button className="btn" onClick={() => updateRole(u.id, 'admin')}
                          disabled={!!actionLoading[u.id]}
                          style={{ background: 'var(--gold)', color: 'white', padding: '4px 10px', fontSize: '0.62rem', gap: 4 }}>
                          {actionLoading[u.id] === 'admin' ? <Loader size={10} className="auth-spinner" /> : <Shield size={10} />} Make Admin
                        </button>
                      )}
                      {u.role === 'admin' && (
                        <button className="btn btn-outline" onClick={() => updateRole(u.id, 'user')}
                          disabled={!!actionLoading[u.id]}
                          style={{ padding: '4px 10px', fontSize: '0.62rem', gap: 4 }}>
                          {actionLoading[u.id] === 'user' ? <Loader size={10} className="auth-spinner" /> : <ShieldOff size={10} />} Revoke Admin
                        </button>
                      )}
                      {u.role !== 'banned' && (
                        <button className="btn btn-outline" onClick={() => updateRole(u.id, 'banned')}
                          disabled={!!actionLoading[u.id]}
                          style={{ borderColor: 'var(--red)', color: 'var(--red)', padding: '4px 10px', fontSize: '0.62rem', gap: 4 }}>
                          {actionLoading[u.id] === 'banned' ? <Loader size={10} className="auth-spinner" /> : <Ban size={10} />} Ban
                        </button>
                      )}
                      {u.role === 'banned' && (
                        <button className="btn" onClick={() => updateRole(u.id, 'user')}
                          disabled={!!actionLoading[u.id]}
                          style={{ background: 'var(--green)', color: 'white', padding: '4px 10px', fontSize: '0.62rem', gap: 4 }}>
                          Unban
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
