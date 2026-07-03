import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import api from '../services/api'
import { setLanguage, t } from '../i18n/translations'
import {
  clearStoredSettings,
  getStoredSettings,
  getSessionUser,
  saveStoredSettings,
} from '../utils/session'
import Notifications from './Notifications.jsx'
import Sidebar from './Sidebar.jsx'

function Layout() {
  const user = getSessionUser()
  const [, setSettingsVersion] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get(user.role === 'owner' ? '/settings' : '/settings/security')
        const settings = response.data || {}
        saveStoredSettings({ ...getStoredSettings(), ...settings })
        if (settings.language) {
          setLanguage(settings.language)
        }
        setSettingsVersion((version) => version + 1)
        window.dispatchEvent(new Event('shopmate:settings-changed'))
      } catch {
        clearStoredSettings()
      }
    }

    loadSettings()
  }, [user.role])

  useEffect(() => {
    const handleSettingsChanged = () => {
      setSettingsVersion((version) => version + 1)
    }

    window.addEventListener('shopmate:settings-changed', handleSettingsChanged)
    window.addEventListener('shopmate:language-changed', handleSettingsChanged)

    return () => {
      window.removeEventListener('shopmate:settings-changed', handleSettingsChanged)
      window.removeEventListener('shopmate:language-changed', handleSettingsChanged)
    }
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return undefined

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileMenuOpen])

  return (
    <div className={`app-shell ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
      <header className="mobile-app-header">
        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className="mobile-brand">
          <div className="brand-mark">SM</div>
          <strong>ShopMate LK</strong>
        </div>
        <div className="mobile-header-actions">
          <Notifications />
          <div className="user-pill">
            <span>{user?.role || 'owner'}</span>
          </div>
        </div>
      </header>
      <button
        type="button"
        className="mobile-sidebar-overlay"
        onClick={() => setMobileMenuOpen(false)}
        aria-label={t('Close')}
      />
      <Sidebar
        onNavigate={() => setMobileMenuOpen(false)}
        onClose={() => setMobileMenuOpen(false)}
      />
      <main className="app-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">ShopMate LK</p>
            <h1>{user?.name ? `${t('Welcome')}, ${user.name}` : t('POS Billing')}</h1>
          </div>
          <div className="topbar-actions">
            <Notifications />
            <div className="user-pill">
              <span>{user?.role || 'owner'}</span>
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
