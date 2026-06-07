import { useState, useEffect } from 'react'
import axios from 'axios'
import { Sliders, Gift, DollarSign, Loader, CheckCircle, Zap, AlertTriangle } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

// Numeric controls for the real on-chain trading engine.
const TRADE_FIELDS = [
  { key: 'real_trade_max_eth', label: 'Max ETH per Buy', step: '0.0001', min: 0, hint: 'Most ETH an agent spends on a single buy, per cycle.' },
  { key: 'real_trade_gas_buffer_eth', label: 'Gas Buffer (ETH)', step: '0.0001', min: 0, hint: 'ETH kept aside for gas and never spent on swaps.' },
  { key: 'real_trade_min_usd', label: 'Min Wallet Value (USD)', step: '1', min: 0, hint: 'Agent must hold at least this much real money to trade.' },
  { key: 'real_trade_max_agents', label: 'Max Agents per Cycle', step: '1', min: 1, hint: 'How many agents may trade each cycle (limits gas cost).' },
  { key: 'real_trade_sell_probability', label: 'Sell Probability', step: '0.05', min: 0, max: 1, hint: 'Chance an eligible agent sells a holding instead of buying (0–1).' },
  { key: 'real_trade_take_profit_pct', label: 'Take-Profit (%)', step: '1', min: 0, hint: 'If a holding is up at least this % vs its cost, the agent sells it to lock in profit instead of buying. 0 = off.' },
  { key: 'real_trade_stop_loss_pct', label: 'Stop-Loss (%)', step: '1', min: 0, max: 100, hint: 'If a holding is down at least this % vs its cost, the agent sells it to cut losses instead of buying. 0 = off.' },
  { key: 'real_trade_slippage', label: 'Slippage Tolerance', step: '0.01', min: 0.001, max: 0.5, hint: 'Max acceptable price slippage on a swap (0.08 = 8%).' },
  { key: 'real_trade_interval_ms', label: 'Cycle Interval (ms)', step: '30000', min: 30000, hint: 'Time between trading cycles in milliseconds (600000 = 10 min).' },
  { key: 'real_trade_fee_pct', label: 'Trade Fee (house)', step: '0.005', min: 0, max: 0.2, hint: 'Fee taken from the agent wallet to the house wallet per trade (0.02 = 2%).' },
]

export default function AdminSettings() {
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({})
  const [draft, setDraft] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [savedKey, setSavedKey] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    axios.get(`${API}/api/settings`)
      .then(r => {
        setSettings(r.data || {})
        setDraft(r.data || {})
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const flashSaved = (key) => {
    setSavedKey(key)
    setTimeout(() => setSavedKey(k => (k === key ? null : k)), 1800)
  }

  // Persist one or more keys.
  const save = async (patch, flagKey) => {
    setSavingKey(flagKey)
    setError(null)
    try {
      const r = await axios.put(`${API}/api/settings`, patch)
      setSettings(r.data || {})
      setDraft(d => ({ ...d, ...(r.data || {}) }))
      flashSaved(flagKey)
    } catch (err) {
      setDraft({ ...settings })
      setError(err.response?.data?.error || 'Failed to update setting')
    }
    setSavingKey(null)
  }

  const tradingOn = !!draft.real_trading_enabled

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
        <div className="page-subtitle">Control registration and real on-chain trading</div>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid #ffc8d4', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.75rem', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* ── Free agent registration ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Agent Registration</div>
          <Sliders size={14} color="var(--text3)" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: draft.free_agent_registration ? 'rgba(0,184,122,0.12)' : 'rgba(245,166,35,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {draft.free_agent_registration ? <Gift size={18} color="var(--green)" /> : <DollarSign size={18} color="#d48806" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 2 }}>Free Agent Registration</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', lineHeight: 1.5 }}>
              Agents are deployed free and go <strong>live instantly</strong> (no approval). Each agent
              gets a real Base wallet that the owner funds with ETH.
            </div>
          </div>
          <Toggle
            on={!!draft.free_agent_registration}
            saving={savingKey === 'free_agent_registration'}
            onClick={() => {
              const next = !draft.free_agent_registration
              setDraft(d => ({ ...d, free_agent_registration: next }))
              save({ free_agent_registration: next }, 'free_agent_registration')
            }}
          />
        </div>
        <SaveStatus saving={savingKey === 'free_agent_registration'} saved={savedKey === 'free_agent_registration'} />
      </div>

      {/* ── Real on-chain trading ───────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Real On-Chain Trading</div>
          <Zap size={14} color={tradingOn ? 'var(--green)' : 'var(--text3)'} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.25)', borderRadius: 8, padding: '10px 12px', margin: '4px 0 14px', fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>
          <AlertTriangle size={14} color="#d48806" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>When enabled, agents spend <strong>real ETH</strong> from their own wallets to buy/sell trending Base tokens on Uniswap. Changes apply live — no restart needed.</span>
        </div>

        {/* Master switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 2 }}>Enable Real Trading</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', lineHeight: 1.5 }}>
              Master switch for the autonomous on-chain trading engine.
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: tradingOn ? 'var(--green)' : 'var(--text3)', minWidth: 28, textAlign: 'right' }}>
            {tradingOn ? 'ON' : 'OFF'}
          </span>
          <Toggle
            on={tradingOn}
            saving={savingKey === 'real_trading_enabled'}
            onClick={() => {
              const next = !tradingOn
              setDraft(d => ({ ...d, real_trading_enabled: next }))
              save({ real_trading_enabled: next }, 'real_trading_enabled')
            }}
          />
        </div>
        <SaveStatus saving={savingKey === 'real_trading_enabled'} saved={savedKey === 'real_trading_enabled'} />

        {/* Numeric controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 16 }}>
          {TRADE_FIELDS.map(f => (
            <div key={f.key} style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>{f.label}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="register-input"
                  type="number"
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  value={draft[f.key] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                  style={{ flex: 1, padding: '7px 10px', fontSize: '0.82rem' }}
                />
                <button
                  className="btn btn-primary"
                  disabled={savingKey === f.key || String(draft[f.key]) === String(settings[f.key])}
                  onClick={() => save({ [f.key]: draft[f.key] }, f.key)}
                  style={{ padding: '7px 12px', fontSize: '0.7rem', opacity: String(draft[f.key]) === String(settings[f.key]) ? 0.5 : 1 }}
                >
                  {savingKey === f.key ? <Loader size={12} className="auth-spinner" /> : savedKey === f.key ? <CheckCircle size={12} /> : 'Save'}
                </button>
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>{f.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, saving, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      aria-label="Toggle"
      style={{
        background: on ? 'var(--green)' : 'var(--border)',
        width: 48, height: 26, borderRadius: 13, border: 'none',
        cursor: saving ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        opacity: saving ? 0.6 : 1,
      }}
    >
      <div style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
    </button>
  )
}

function SaveStatus({ saving, saved }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, minHeight: 18, fontSize: '0.72rem' }}>
      {saving && (<><Loader size={12} className="auth-spinner" /><span style={{ color: 'var(--text3)' }}>Saving...</span></>)}
      {!saving && saved && (<><CheckCircle size={12} color="var(--green)" /><span style={{ color: 'var(--green)' }}>Saved</span></>)}
    </div>
  )
}
