import { isModuleEnabled } from './shopModules'

export const permissions = [
  { value: 'dashboard_view', label: 'Dashboard' },
  { value: 'products_view', label: 'View Products' },
  { value: 'products_manage', label: 'Manage Products' },
  { value: 'pos_access', label: 'POS Billing' },
  { value: 'credit_book_access', label: 'Credit Book' },
  { value: 'suppliers_access', label: 'Suppliers' },
  { value: 'stock_access', label: 'Stock' },
  { value: 'stock_adjustments_manage', label: 'Manage Stock Adjustments' },
  { value: 'stock_reconciliation_manage', label: 'Manage Stock Reconciliation' },
  { value: 'purchasing_access', label: 'Purchasing' },
  { value: 'purchasing_manage', label: 'Manage Purchasing' },
  { value: 'purchase_suggestions_access', label: 'Purchase Suggestions' },
  { value: 'returns_access', label: 'Returns' },
  { value: 'expenses_access', label: 'Expenses' },
  { value: 'reports_access', label: 'Reports' },
  { value: 'payment_verification_access', label: 'Payment Verification' },
  { value: 'notifications_access', label: 'Notifications' },
  { value: 'audit_logs_access', label: 'Audit Logs' },
  { value: 'backup_export_access', label: 'Backup / Export' },
  { value: 'settings_access', label: 'Settings' },
  { value: 'staff_manage', label: 'Staff Management' },
]

export const staffRoles = ['staff', 'cashier', 'stock_keeper', 'manager']

export const staffRoleOptions = [
  { value: 'staff', label: 'Staff' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'stock_keeper', label: 'Stock Keeper' },
  { value: 'manager', label: 'Manager' },
]

export const rolePermissions = {
  owner: permissions.map((permission) => permission.value),
  admin: permissions.map((permission) => permission.value),
  cashier: ['products_view', 'pos_access'],
  stock_keeper: [
    'dashboard_view',
    'products_view',
    'products_manage',
    'stock_access',
    'purchase_suggestions_access',
  ],
  manager: [
    'dashboard_view',
    'products_view',
    'pos_access',
    'reports_access',
    'stock_access',
    'expenses_access',
    'suppliers_access',
  ],
  staff: ['dashboard_view', 'products_view', 'pos_access'],
}

export const getEffectivePermissions = (user = {}) => {
  if (user.role === 'owner' || user.role === 'admin') {
    return rolePermissions.owner
  }

  if (Array.isArray(user.permissions)) {
    return user.permissions
  }

  return rolePermissions[user.role] || rolePermissions.staff
}

export const hasPermission = (user, permission) =>
  getEffectivePermissions(user).includes(permission)

export const roleAllowed = (role, roles = []) => {
  if (!roles.length) return true
  if (roles.includes(role)) return true
  return roles.includes('staff') && staffRoles.includes(role)
}

const permissionHomePaths = [
  ['dashboard_view', '/dashboard'],
  ['pos_access', '/pos', 'pos'],
  ['products_view', '/products', 'products'],
  ['payment_verification_access', '/payment-verification', 'pos'],
  ['stock_access', '/stock', 'stock'],
  ['stock_adjustments_manage', '/stock', 'stock'],
  ['stock_reconciliation_manage', '/stock', 'stock'],
  ['purchasing_access', '/purchasing', 'purchasing'],
  ['purchase_suggestions_access', '/purchase-suggestions', 'low_stock'],
  ['reports_access', '/reports', 'reports'],
  ['expenses_access', '/expenses', 'expenses'],
  ['suppliers_access', '/suppliers', 'suppliers'],
  ['credit_book_access', '/credits', 'credit_book'],
  ['returns_access', '/returns', 'returns_exchange'],
  ['notifications_access', '/notification-preferences', 'notifications'],
  ['audit_logs_access', '/audit-logs'],
  ['backup_export_access', '/backup-export', 'backup'],
  ['settings_access', '/settings'],
  ['staff_manage', '/staff', 'staff'],
]

export const getHomePath = (user = {}) => {
  if (user.role === 'admin') return '/admin/dashboard'

  const match = permissionHomePaths.find(
    ([permission, , moduleKey]) =>
      hasPermission(user, permission) && isModuleEnabled(moduleKey),
  )
  return match ? match[1] : '/dashboard'
}
