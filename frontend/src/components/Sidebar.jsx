import { NavLink, useNavigate } from 'react-router-dom'
import { hasPermission } from '../utils/permissions'

const ownerLinks = [
  { to: '/dashboard', label: 'Dashboard', permission: 'dashboard_view' },
  { to: '/products', label: 'Products', permission: 'products_view' },
  { to: '/pos', label: 'POS Billing', permission: 'pos_access' },
  { to: '/payment-verification', label: 'Payment Verification', permission: 'payment_verification_access' },
  { to: '/credits', label: 'Credit Book', permission: 'credit_book_access' },
  { to: '/suppliers', label: 'Suppliers', permission: 'suppliers_access' },
  { to: '/stock', label: 'Stock', permission: 'stock_access' },
  { to: '/purchase-suggestions', label: 'Purchase Suggestions', permission: 'purchase_suggestions_access' },
  { to: '/returns', label: 'Returns', permission: 'returns_access' },
  { to: '/expenses', label: 'Expenses', permission: 'expenses_access' },
  { to: '/reports', label: 'Reports', permission: 'reports_access' },
  { to: '/audit-logs', label: 'Audit Logs', permission: 'audit_logs_access' },
  { to: '/backup-export', label: 'Backup / Export', permission: 'backup_export_access' },
  { to: '/settings', label: 'Settings', permission: 'settings_access' },
  { to: '/staff', label: 'Staff', permission: 'staff_manage' },
]

function Sidebar() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const visibleLinks = ownerLinks.filter((link) => hasPermission(user, link.permission))

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SM</div>
        <div>
          <strong>ShopMate LK</strong>
          <span>POS and Stock</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {visibleLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <button type="button" className="ghost-button sidebar-logout" onClick={logout}>
        Logout
      </button>
    </aside>
  )
}

export default Sidebar
