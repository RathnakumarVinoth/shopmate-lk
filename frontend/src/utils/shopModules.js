import {
  getSessionUser,
  getShopSession,
  getStoredSettings,
} from './session'

export const shopTypeOptions = [
  { value: 'grocery', label: 'Grocery' },
  { value: 'hardware', label: 'Hardware / Construction Items' },
  { value: 'mobile_repair', label: 'Mobile Shop + Repair' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'custom', label: 'Custom' },
]

export const moduleOptions = [
  { value: 'pos', label: 'POS' },
  { value: 'products', label: 'Products' },
  { value: 'stock', label: 'Stock' },
  { value: 'barcode', label: 'Barcode' },
  { value: 'customers', label: 'Customers' },
  { value: 'credit_book', label: 'Credit Book' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'purchasing', label: 'Purchasing' },
  { value: 'grn', label: 'GRN' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'reports', label: 'Reports' },
  { value: 'backup', label: 'Backup / Restore' },
  { value: 'staff', label: 'Staff' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'receipt_printing', label: 'Receipt Printing' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'expiry_batch', label: 'Expiry / Batch' },
  { value: 'quotations', label: 'Quotations' },
  { value: 'delivery_notes', label: 'Delivery Notes' },
  { value: 'unit_conversion', label: 'Unit Conversion' },
  { value: 'imei_serial', label: 'IMEI / Serial' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'repair_jobs', label: 'Repair Jobs' },
  { value: 'technician_status', label: 'Technician Status' },
  { value: 'advance_payments', label: 'Advance Payments' },
  { value: 'parts_used', label: 'Parts Used' },
  { value: 'pickup_receipt', label: 'Pickup Receipt' },
  { value: 'product_variants', label: 'Product Variants' },
  { value: 'size_color', label: 'Size / Color' },
  { value: 'barcode_labels', label: 'Barcode Labels' },
  { value: 'returns_exchange', label: 'Returns / Exchange' },
  { value: 'discounts_promotions', label: 'Discounts / Promotions' },
]

export const currentCoreModules = [
  'pos',
  'products',
  'stock',
  'barcode',
  'customers',
  'credit_book',
  'suppliers',
  'purchasing',
  'grn',
  'expenses',
  'reports',
  'backup',
  'staff',
  'notifications',
  'receipt_printing',
  'low_stock',
  'returns_exchange',
]

export const defaultModulesByShopType = {
  grocery: [
    'pos',
    'products',
    'stock',
    'barcode',
    'credit_book',
    'suppliers',
    'expenses',
    'reports',
    'backup',
    'receipt_printing',
    'low_stock',
  ],
  hardware: [
    'pos',
    'products',
    'stock',
    'customers',
    'credit_book',
    'suppliers',
    'purchasing',
    'grn',
    'quotations',
    'delivery_notes',
    'unit_conversion',
    'expenses',
    'reports',
    'backup',
    'receipt_printing',
  ],
  mobile_repair: [
    'pos',
    'products',
    'stock',
    'customers',
    'imei_serial',
    'warranty',
    'repair_jobs',
    'technician_status',
    'advance_payments',
    'parts_used',
    'reports',
    'backup',
    'receipt_printing',
    'pickup_receipt',
  ],
  clothing: [
    'pos',
    'products',
    'stock',
    'product_variants',
    'size_color',
    'barcode_labels',
    'customers',
    'returns_exchange',
    'discounts_promotions',
    'reports',
    'backup',
    'receipt_printing',
  ],
  custom: currentCoreModules,
}

const knownShopTypes = new Set(shopTypeOptions.map((type) => type.value))
const knownModules = new Set(moduleOptions.map((moduleOption) => moduleOption.value))

export const normalizeShopType = (value) => {
  const normalized = String(value || 'custom').trim().toLowerCase()
  return knownShopTypes.has(normalized) ? normalized : 'custom'
}

export const getDefaultModulesForShopType = (shopType = 'custom') => [
  ...(defaultModulesByShopType[normalizeShopType(shopType)] || currentCoreModules),
]

const parseModules = (value) => {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return null

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const normalizeEnabledModules = (value, shopType = 'custom') => {
  const rawModules = parseModules(value) || getDefaultModulesForShopType(shopType)
  return [...new Set(rawModules.map((moduleKey) => String(moduleKey).trim().toLowerCase()))]
    .filter((moduleKey) => knownModules.has(moduleKey))
}

export const getStoredEnabledModules = () => {
  const settings = getStoredSettings()
  if (settings.enabled_modules !== undefined || settings.shop_type !== undefined) {
    return normalizeEnabledModules(settings.enabled_modules, settings.shop_type)
  }

  const shopSession = getShopSession()
  const sessionShop = shopSession?.shop || {}
  if (sessionShop.enabled_modules !== undefined || sessionShop.shop_type !== undefined) {
    return normalizeEnabledModules(sessionShop.enabled_modules, sessionShop.shop_type)
  }

  const user = getSessionUser()
  const userShop = user?.shop || {}
  if (userShop.enabled_modules !== undefined || userShop.shop_type !== undefined) {
    return normalizeEnabledModules(userShop.enabled_modules, userShop.shop_type)
  }

  return currentCoreModules
}

export const isModuleEnabled = (moduleKey, source) => {
  if (!moduleKey) return true

  const user = getSessionUser()
  if (user.role === 'admin') return true

  const enabledModules = source
    ? normalizeEnabledModules(source.enabled_modules, source.shop_type)
    : getStoredEnabledModules()

  return enabledModules.includes(moduleKey)
}
