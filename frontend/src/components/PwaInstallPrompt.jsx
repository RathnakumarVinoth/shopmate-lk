import { useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import BrandLogo from './BrandLogo.jsx'

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone() || localStorage.getItem('shopmatePwaInstalled') === 'true') {
      return undefined
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setVisible(true)
    }

    const handleInstalled = () => {
      localStorage.setItem('shopmatePwaInstalled', 'true')
      setInstallPrompt(null)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const installApp = async () => {
    if (!installPrompt) return

    installPrompt.prompt()
    const result = await installPrompt.userChoice

    if (result.outcome === 'accepted') {
      localStorage.setItem('shopmatePwaInstalled', 'true')
    }

    setInstallPrompt(null)
    setVisible(false)
  }

  const dismiss = () => {
    setVisible(false)
  }

  if (!visible || !installPrompt) return null

  return (
    <aside className="pwa-install-banner" aria-label={t('Install App')}>
      <div className="pwa-install-copy">
        <BrandLogo decorative className="pwa-install-logo" />
        <div>
          <strong>{t('Install App')}</strong>
          <span>{t('Add ShopMate LK to your home screen for faster access.')}</span>
        </div>
      </div>
      <div className="pwa-install-actions">
        <button type="button" onClick={installApp}>
          {t('Install App')}
        </button>
        <button type="button" className="ghost-button" onClick={dismiss}>
          {t('Not now')}
        </button>
      </div>
    </aside>
  )
}

export default PwaInstallPrompt
