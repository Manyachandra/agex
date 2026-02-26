import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader } from 'lucide-react'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [processing, setProcessing] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    }).catch(() => {
      navigate('/login', { replace: true })
    }).finally(() => {
      setProcessing(false)
    })
  }, [navigate])

  return (
    <div className="auth-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="auth-card" style={{ textAlign: 'center', padding: 48 }}>
        {processing && (
          <>
            <Loader size={32} className="auth-spinner" style={{ margin: '0 auto 16px', display: 'block' }} />
            <p style={{ color: 'var(--text3)', fontSize: '0.9rem' }}>Completing sign in...</p>
          </>
        )}
      </div>
    </div>
  )
}
