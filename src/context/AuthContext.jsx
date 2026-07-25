import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { API_BASE as API } from '../lib/config'

const AuthContext = createContext(null)

function shortName(address) {
  if (!address) return 'Trader'
  return `Trader ${address.slice(2, 6).toUpperCase()}`
}

export function AuthProvider({ children }) {
  const { address, isConnected, status } = useAccount()
  const { disconnectAsync } = useDisconnect()
  const { openConnectModal } = useConnectModal()

  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const wallet = isConnected && address ? address.toLowerCase() : null
  const user = wallet ? { id: wallet, address: wallet } : null
  const loading = status === 'connecting' || status === 'reconnecting' || (Boolean(wallet) && profileLoading && !profile)

  const refreshProfile = useCallback(async () => {
    if (!wallet) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    try {
      const res = await fetch(`${API}/api/user/profile/${wallet}`)
      if (res.ok) {
        setProfile(await res.json())
        return
      }
      const createRes = await fetch(`${API}/api/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: wallet,
          walletAddress: wallet,
          username: shortName(wallet),
          role: 'user',
        }),
      })
      const created = createRes.ok ? await createRes.json() : null
      setProfile(created || {
        id: wallet,
        walletAddress: wallet,
        username: shortName(wallet),
        role: 'user',
        ephemeral: true,
      })
    } catch {
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }, [wallet])

  useEffect(() => {
    if (!wallet) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    refreshProfile()
  }, [wallet, refreshProfile])

  const connectWallet = () => {
    openConnectModal?.()
  }

  const signOut = async () => {
    try {
      await disconnectAsync()
    } catch {
      // ignore
    }
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session: null,
        loading: status === 'connecting' || status === 'reconnecting',
        walletConnected: Boolean(wallet),
        signOut,
        refreshProfile,
        connectWallet,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
