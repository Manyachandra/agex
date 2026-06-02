import { useState, useEffect } from 'react'
import axios from 'axios'
import { Sliders, Gift, DollarSign, Loader, CheckCircle } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

export default function AdminSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [freeRegistration, setFreeRegistration] = useState(false)

  useEffect(() => {
    axios.get(`${API}/api/settings`)
      .then(r => setFreeRegistration(!!r.data?.free_agent_registration))
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const toggleFreeRegistration = async () => {
    const next = !freeRegistration
    setSaving(true)
    setError(null)
    setFreeRegistration(next)
    try {
      await axios.put(`${API}/api/settings`, { free_agent_registration: next })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      setFreeRegistration(!next)
      setError(err.response?.data?.error || 'Failed to update setting')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
        Loading settings...
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Platform Settings</div>
        <div className="page-subtitle">Toggle behavior of the Axionet platform</div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Agent Registration</div>
          <Sliders size={14} color="var(--text3)" />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '14px 0',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: 40, height: 40, borderRadius: 10,
              background: freeRegistration ? 'rgba(0,184,122,0.12)' : 'rgba(245,166,35,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {freeRegistration
              ? <Gift size={18} color="var(--green)" />
              : <DollarSign size={18} color="#d48806" />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 2 }}>
              Free Agent Registration
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', lineHeight: 1.5 }}>
              When <strong>ON</strong>, users can create a new agent for free on the Register page —
              no wallet connection or USDC payment required.
              When <strong>OFF</strong>, users must pay <strong>$10 USDC</strong> on Base to deploy an agent.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: freeRegistration ? 'var(--green)' : 'var(--text3)',
                minWidth: 28, textAlign: 'right',
              }}
            >
              {freeRegistration ? 'ON' : 'OFF'}
            </span>
            <button
              onClick={toggleFreeRegistration}
              disabled={saving}
              aria-label="Toggle free agent registration"
              style={{
                background: freeRegistration ? 'var(--green)' : 'var(--border)',
                width: 48, height: 26, borderRadius: 13, border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                position: 'relative', transition: 'background 0.2s',
                opacity: saving ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  position: 'absolute', top: 3,
                  left: freeRegistration ? 25 : 3,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'white', transition: 'left 0.2s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                }}
              />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 6, minHeight: 22,
            fontSize: '0.72rem',
          }}
        >
          {saving && (
            <>
              <Loader size={12} className="auth-spinner" />
              <span style={{ color: 'var(--text3)' }}>Saving...</span>
            </>
          )}
          {!saving && saved && (
            <>
              <CheckCircle size={12} color="var(--green)" />
              <span style={{ color: 'var(--green)' }}>Saved</span>
            </>
          )}
          {!saving && error && (
            <span style={{ color: 'var(--red)' }}>{error}</span>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Current Behavior</div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text2)', lineHeight: 1.7 }}>
          <div>
            Users visiting <code>/register</code> will currently see a{' '}
            <strong style={{ color: freeRegistration ? 'var(--green)' : 'var(--gold)' }}>
              {freeRegistration ? 'Deploy Agent — Free' : 'Deploy Agent — $10 USDC'}
            </strong>{' '}
            button.
          </div>
          {freeRegistration ? (
            <div style={{ marginTop: 8, color: 'var(--text3)' }}>
              No on-chain payment is required. New agents are still created with{' '}
              <code>pending_approval</code> status and must be approved from{' '}
              <code>/admin/agents</code>.
            </div>
          ) : (
            <div style={{ marginTop: 8, color: 'var(--text3)' }}>
              The Register page asks for a wallet connection on the Base network and verifies a
              <strong> $10 USDC </strong>
              transfer to the house wallet before creating the agent.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
