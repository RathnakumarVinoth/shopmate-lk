export const permissions = [
  { value: 'dashboard_view', label: 'Dashboard' },
  { value: 'products_view', label: 'View Products' },
  { value: 'products_manage', label: 'Manage Products' },
  { value: 'pos_access', label: 'POS Billing' },
  { value: 'credit_book_access', label: 'Credit Book' },
  { value: 'suppliers_access', label: 'Suppliers' },
  { value: 'stock_access', label: 'Stock' },
  { value: 'purchase_suggestions_access', label: 'Purchase Suggestions' },
  { value: 'returns_access', label: 'Returns' },
  { value: 'expenses_access', label: 'Expenses' },
  { value: 'reports_access', label: 'Reports' },
  { value: 'payment_verification_access', label: 'Payment Verification' },
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
  cashier: ['products_view', 'pos_access', 'payment_verification_access'],
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
  staff: ['dashboard_view', 'products_view', 'pos_access', 'payment_verification_access'],
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
  ['pos_access', '/pos'],
  ['products_view', '/products'],
  ['payment_verification_access', '/payment-verification'],
  ['stock_access', '/stock'],
  ['purchase_suggestions_access', '/purchase-suggestions'],
  ['reports_access', '/reports'],
  ['expenses_access', '/expenses'],
  ['suppliers_access', '/suppliers'],
  ['credit_book_access', '/credits'],
  ['returns_access', '/returns'],
  ['audit_logs_access', '/audit-logs'],
  ['backup_export_access', '/backup-export'],
  ['settings_access', '/settings'],
  ['staff_manage', '/staff'],
]

export const getHomePath = (user = {}) => {
  if (user.role === 'admin') return '/admin/dashboard'

  const match = permissionHomePaths.find(([permission]) => hasPermission(user, permission))
  return match ? match[1] : '/dashboard'
}
