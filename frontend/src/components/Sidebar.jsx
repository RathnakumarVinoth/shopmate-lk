import { NavLink, useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import { hasPermission } from '../utils/permissions'

const ownerLinks = [
  { to: '/dashboard', labelKey: 'dashboard', permission: 'dashboard_view' },
  { to: '/products', labelKey: 'products', permission: 'products_view' },
  { to: '/pos', labelKey: 'posBilling', permission: 'pos_access' },
  { to: '/payment-verification', labelKey: 'paymentVerification', permission: 'payment_verification_access' },
  { to: '/credits', labelKey: 'creditBook', permission: 'credit_book_access' },
  { to: '/suppliers', labelKey: 'suppliers', permission: 'suppliers_access' },
  { to: '/stock', labelKey: 'stock', permission: 'stock_access' },
  { to: '/purchase-suggestions', labelKey: 'Purchase Suggestions', permission: 'purchase_suggestions_access' },
  { to: '/returns', labelKey: 'Returns', permission: 'returns_access' },
  { to: '/expenses', labelKey: 'Expenses', permission: 'expenses_access' },
  { to: '/reports', labelKey: 'reports', permission: 'reports_access' },
  { to: '/audit-logs', labelKey: 'auditLogs', permission: 'audit_logs_access' },
  { to: '/backup-export', labelKey: 'backupExport', permission: 'backup_export_access' },
  { to: '/settings', labelKey: 'settings', permission: 'settings_access' },
  { to: '/staff', labelKey: 'staff', permission: 'staff_manage' },
]

function Sidebar({ onNavigate, onClose }) {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const visibleLinks = ownerLinks.filter((link) => hasPermission(user, link.permission))

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    onNavigate?.()
    navigate('/login')
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SM</div>
        <div>
          <strong>ShopMate LK</strong>
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

      <button type="button" className="ghost-button sidebar-logout" onClick={logout}>
        {t('logout')}
      </button>
    </aside>
  )
}

export default Sidebar
