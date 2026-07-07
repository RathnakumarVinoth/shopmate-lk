import { NavLink, useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import { hasPermission, roleAllowed } from '../utils/permissions'
import { isModuleEnabled } from '../utils/shopModules'
import { clearSession, getSessionUser } from '../utils/session'
import BrandLogo from './BrandLogo.jsx'

const ownerLinks = [
  { to: '/dashboard', labelKey: 'dashboard', permission: 'dashboard_view' },
  { to: '/products', labelKey: 'products', permission: 'products_view', module: 'products' },
  { to: '/pos', labelKey: 'posBilling', permission: 'pos_access', module: 'pos' },
  {
    to: '/payment-verification',
    labelKey: 'paymentVerification',
    permission: 'payment_verification_access',
    roles: ['owner'],
    module: 'pos',
  },
  { to: '/credits', labelKey: 'creditBook', permission: 'credit_book_access', module: 'credit_book' },
  { to: '/suppliers', labelKey: 'suppliers', permission: 'suppliers_access', module: 'suppliers' },
  { to: '/stock', labelKey: 'stock', permission: 'stock_access', module: 'stock' },
  { to: '/purchasing', labelKey: 'purchasing', permission: 'purchasing_access', module: 'purchasing' },
  { to: '/purchase-suggestions', labelKey: 'Purchase Suggestions', permission: 'purchase_suggestions_access', module: 'low_stock' },
  { to: '/returns', labelKey: 'Returns', permission: 'returns_access', module: 'returns_exchange' },
  { to: '/expenses', labelKey: 'Expenses', permission: 'expenses_access', module: 'expenses' },
  { to: '/reports', labelKey: 'reports', permission: 'reports_access', module: 'reports' },
  {
    to: '/notification-preferences',
    labelKey: 'Notifications',
    permission: 'notifications_access',
    roles: ['owner'],
    module: 'notifications',
  },
  { to: '/audit-logs', labelKey: 'auditLogs', permission: 'audit_logs_access' },
  { to: '/backup-export', labelKey: 'backupExport', permission: 'backup_export_access', module: 'backup' },
  { to: '/settings', labelKey: 'settings', permission: 'settings_access' },
  { to: '/staff', labelKey: 'staff', permission: 'staff_manage', module: 'staff' },
]

function Sidebar({ shopName = 'ShopMate LK', onNavigate, onClose }) {
  const navigate = useNavigate()
  const user = getSessionUser()
  const visibleLinks = ownerLinks.filter(
    (link) =>
      hasPermission(user, link.permission) &&
      roleAllowed(user.role, link.roles) &&
      isModuleEnabled(link.module),
  )

  const userLogout = () => {
    clearSession()
    onNavigate?.()
    navigate('/role-login')
  }

  const shopLogout = () => {
    clearSession(undefined, { clearShop: true })
    onNavigate?.()
    navigate('/shop-login')
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <BrandLogo decorative />
        </div>
        <div>
          <strong>{shopName}</strong>
          <span>{t('POS and Stock')}</span>
        </div>
        <button type="button" className="mobile-drawer-close" onClick={onClose} aria-label={t('Close')}>
          x
        </button>
      </div>

      <nav className="sidebar-nav">
        {visibleLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end
            className={({ isActive }) => (isActive ? 'active' : '')}
            onClick={onNavigate}
          >
            {link.labelKey ? t(link.labelKey) : link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-session-actions">
        <button type="button" className="ghost-button sidebar-logout" onClick={userLogout}>
          {t('User Logout')}
        </button>
        <button type="button" className="ghost-button sidebar-logout sidebar-shop-logout" onClick={shopLogout}>
          {t('Shop Logout')}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
