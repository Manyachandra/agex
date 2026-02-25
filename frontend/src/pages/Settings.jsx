import { useState } from 'react'
import { Settings as SettingsIcon, Save, RefreshCw, AlertTriangle, Info } from 'lucide-react'

export default function Settings() {
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState({
    exchangeInterval: 10,
    taskInterval: 15,
    bankruptcyThreshold: 0.10,
    dominantMultiplier: 1.5,
    tradeFee: 2,
    twitterEnabled: true,
    dashboardAutoRefresh: 30,
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Exchange configuration and parameters</div>
      </div>

      <div className="grid-2" style={{ gap: '20px' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Exchange Engine */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Exchange Engine</div>
              <span className="badge badge-green">RUNNING</span>
            </div>
            {[
              { label: 'Exchange Cycle Interval', key: 'exchangeInterval', unit: 'minutes', min: 1, max: 60 },
              { label: 'Task Cycle Interval', key: 'taskInterval', unit: 'minutes', min: 1, max: 60 },
              { label: 'Dashboard Refresh Rate', key: 'dashboardAutoRefresh', unit: 'seconds', min: 10, max: 300 },
            ].map(s => (
              <div key={s.key} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{s.label}</label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>
                    {settings[s.key]} {s.unit}
                  </span>
                </div>
                <input type="range" min={s.min} max={s.max}
                  value={settings[s.key]}
                  onChange={e => setSettings({ ...settings, [s.key]: parseInt(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--green)' }}
                />
              </div>
            ))}
          </div>

          {/* Trading Rules */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Trading Rules</div>
            </div>
            {[
              { label: 'Trade Fee', key: 'tradeFee', unit: '%', min: 0, max: 10, step: 0.5 },
              { label: 'Bankruptcy Threshold', key: 'bankruptcyThreshold', unit: '$', min: 0.01, max: 1, step: 0.01 },
              { label: 'Dominant Price Multiplier', key: 'dominantMultiplier', unit: 'x avg', min: 1.1, max: 3, step: 0.1 },
            ].map(s => (
              <div key={s.key} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{s.label}</label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>
                    {settings[s.key]} {s.unit}
                  </span>
                </div>
                <input type="range" min={s.min} max={s.max} step={s.step || 1}
                  value={settings[s.key]}
                  onChange={e => setSettings({ ...settings, [s.key]: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--green)' }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Integrations */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Integrations</div>
            </div>
            {[
              { label: 'Twitter Auto-posting', key: 'twitterEnabled', description: 'Post updates to @UniApe007 automatically' },
            ].map(s => (
              <div key={s.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: '1px solid var(--border)'
              }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>{s.label}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text3)', marginTop: '2px' }}>{s.description}</div>
                </div>
                <button onClick={() => setSettings({ ...settings, [s.key]: !settings[s.key] })} style={{
                  background: settings[s.key] ? 'var(--green)' : 'var(--border)',
                  width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                  cursor: 'pointer', position: 'relative', transition: 'background 0.2s'
                }}>
                  <div style={{
                    position: 'absolute', top: '3px',
                    left: settings[s.key] ? '23px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'white', transition: 'left 0.2s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>
            ))}
          </div>

          {/* System Info */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">System Info</div>
              <Info size={14} color="var(--text3)" />
            </div>
            {[
              { label: 'Backend', value: 'Node.js + Express' },
              { label: 'Database', value: 'Supabase (PostgreSQL)' },
              { label: 'Frontend', value: 'React + Vite' },
              { label: 'Real-time', value: 'Socket.io' },
              { label: 'Charts', value: 'Recharts' },
              { label: 'Automation', value: 'OpenClaw + node-cron' },
              { label: 'Twitter', value: '@UniApe007' },
              { label: 'Exchange Status', value: '🟢 RUNNING' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < 7 ? '1px solid var(--border)' : 'none'
              }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{item.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)' }}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Danger Zone */}
          <div className="card" style={{ border: '1px solid var(--red-bg)', background: '#fff8f8' }}>
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--red)' }}>Danger Zone</div>
              <AlertTriangle size={14} color="var(--red)" />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '12px' }}>
              These actions cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-outline" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.7rem' }}>
                Reset All Agents
              </button>
              <button className="btn btn-outline" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.7rem' }}>
                Clear Activity Log
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button className="btn btn-outline">
          <RefreshCw size={14} style={{ marginRight: '6px' }} />
          Reset Defaults
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={14} style={{ marginRight: '6px' }} />
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}