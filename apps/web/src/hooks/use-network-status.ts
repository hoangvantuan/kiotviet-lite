import { useEffect } from 'react'

import { useOfflineStore } from '@/stores/use-offline-store'

export function useNetworkStatus() {
  const setStatus = useOfflineStore((s) => s.setStatus)

  useEffect(() => {
    const goOnline = () => setStatus('online')
    const goOffline = () => setStatus('offline')

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [setStatus])
}
