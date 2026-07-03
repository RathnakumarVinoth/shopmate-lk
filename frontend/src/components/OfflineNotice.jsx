import { useEffect, useState } from 'react'
import { t } from '../i18n/translations'

function OfflineNotice() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (online) return null

  return (
    <div className="offline-notice" role="status">
      {t('You are offline. Cash billing is available. Sales will sync when internet returns.')}
    </div>
  )
}

export default OfflineNotice
