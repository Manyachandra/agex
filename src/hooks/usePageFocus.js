import { useEffect } from 'react'

export function usePageFocus(callback) {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') callback()
    }
    const handleFocus = () => callback()

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [callback])
}