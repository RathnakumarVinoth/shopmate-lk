import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import { clearSession, getSessionUser } from '../utils/session'
import BrandLogo from './BrandLogo.jsx'
import LanguageSelector from './LanguageSelector.jsx'
import { useEffect, useState } from 'react'

function AdminLayout() {
  const navigate = useNavigate()
  const user = getSessionUser()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [, setLanguageVersion] = useState(0)

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

  const logout = () => {
    clearSession()
    setMobileMenuOpen(false)
    navigate('/admin/login')
  }

  return (
    <div className={`app-shell admin-shell ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
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
          <div className="brand-mark">
            <BrandLogo decorative />
          </div>
          <strong>ShopMate LK</strong>
        </div>
        <div className="mobile-header-actions">
          <LanguageSelector compact onLanguageChange={() => setLanguageVersion((version) => version + 1)} />
          <div className="user-pill">
            <span>{user?.role || 'admin'}</span>
          </div>
        </div>
      </header>
      <button
        type="button"
        className="mobile-sidebar-overlay"
        onClick={() => setMobileMenuOpen(false)}
        aria-label={t('Close')}
      />
      <aside className="sidebar admin-sidebar">
        <div className="brand">
          <div className="brand-mark">
            <BrandLogo decorative />
          </div>
          <div>
            <strong>{t('Super Admin')}</strong>
            <span>{t('ShopMate Control')}</span>
          </div>
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label={t('Close')}
          >
            x
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/admin/dashboard"
            className={({ isActive }) => (isActive ? 'active' : '')}
            onClick={() => setMobileMenuOpen(false)}
          >
            {t('Admin Dashboard')}
          </NavLink>
          <NavLink
            to="/admin/shops"
            className={({ isActive }) => (isActive ? 'active' : '')}
            onClick={() => setMobileMenuOpen(false)}
          >
            Shops
          </NavLink>
          <NavLink
            to="/admin/audit-logs"
            className={({ isActive }) => (isActive ? 'active' : '')}
            onClick={() => setMobileMenuOpen(false)}
          >
            {t('Audit Logs')}
          </NavLink>
          <NavLink
            to="/admin/login-activity"
            className={({ isActive }) => (isActive ? 'active' : '')}
            onClick={() => setMobileMenuOpen(false)}
          >
            {t('Login Activity')}
          </NavLink>
        </nav>

        <button type="button" className="ghost-button sidebar-logout" onClick={logout}>
          {t('Logout')}
        </button>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">ShopMate LK</p>
            <h1>{user?.name ? `${t('Welcome')}, ${user.name}` : 'Admin Console'}</h1>
          </div>
          <div className="topbar-actions">
            <LanguageSelector onLanguageChange={() => setLanguageVersion((version) => version + 1)} />
            <div className="user-pill">
              <span>{user?.role || 'admin'}</span>
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
