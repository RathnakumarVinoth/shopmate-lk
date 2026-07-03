export const defaultLanguage = 'en'

export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'si', label: 'සිංහල' },
  { value: 'ta', label: 'தமிழ்' },
]

const supportedLanguages = languageOptions.map((language) => language.value)

export const translations = {
  en: {
    add: 'Add',
    addProduct: 'Add Product',
    auditLogs: 'Audit Logs',
    backupExport: 'Backup / Export',
    balance: 'Balance',
    balanceDue: 'Balance Due',
    change: 'Change',
    creditBalance: 'Credit Balance',
    creditBook: 'Credit Book',
    dashboard: 'Dashboard',
    delete: 'Delete',
    deleting: 'Deleting...',
    discount: 'Discount',
    downloadPdf: 'Download PDF',
    edit: 'Edit',
    editProduct: 'Edit Product',
    english: 'English',
    language: 'Language',
    login: 'Login',
    logout: 'Logout',
    paid: 'Paid',
    paidAmount: 'Paid Amount',
    paymentMethod: 'Payment Method',
    paymentStatus: 'Payment Status',
    paymentVerification: 'Payment Verification',
    posBilling: 'POS Billing',
    print: 'Print',
    products: 'Products',
    receipt: 'Receipt',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    reports: 'Reports',
    save: 'Save',
    saveSettings: 'Save Settings',
    saving: 'Saving...',
    settings: 'Settings',
    sinhala: 'Sinhala',
    staff: 'Staff',
    stock: 'Stock',
    subtotal: 'Subtotal',
    suppliers: 'Suppliers',
    tamil: 'Tamil',
    total: 'Total',
    updateProduct: 'Update Product',
  },
  si: {
    add: 'එක් කරන්න',
    addProduct: 'නිෂ්පාදනය එක් කරන්න',
    auditLogs: 'විගණන ලොග්',
    backupExport: 'උපස්ථ / අපනයනය',
    balance: 'ශේෂය',
    balanceDue: 'ගෙවිය යුතු ශේෂය',
    change: 'ඉතිරිය',
    creditBalance: 'ණය ශේෂය',
    creditBook: 'ණය පොත',
    dashboard: 'උපකරණ පුවරුව',
    delete: 'මකන්න',
    deleting: 'මකමින්...',
    discount: 'වට්ටම',
    downloadPdf: 'PDF බාගන්න',
    edit: 'සංස්කරණය',
    editProduct: 'නිෂ්පාදනය සංස්කරණය',
    english: 'ඉංග්‍රීසි',
    language: 'භාෂාව',
    login: 'පිවිසීම',
    logout: 'ඉවත් වීම',
    paid: 'ගෙවූ මුදල',
    paidAmount: 'ගෙවූ මුදල',
    paymentMethod: 'ගෙවීම් ක්‍රමය',
    paymentStatus: 'ගෙවීම් තත්ත්වය',
    paymentVerification: 'ගෙවීම් තහවුරු කිරීම',
    posBilling: 'POS බිල්පත්',
    print: 'මුද්‍රණය',
    products: 'නිෂ්පාදන',
    receipt: 'රිසිට්පත',
    refresh: 'නැවුම් කරන්න',
    refreshing: 'නැවුම් කරමින්...',
    reports: 'වාර්තා',
    save: 'සුරකින්න',
    saveSettings: 'සැකසුම් සුරකින්න',
    saving: 'සුරකිමින්...',
    settings: 'සැකසුම්',
    sinhala: 'සිංහල',
    staff: 'කාර්ය මණ්ඩලය',
    stock: 'තොගය',
    subtotal: 'උප එකතුව',
    suppliers: 'සැපයුම්කරුවන්',
    tamil: 'දෙමළ',
    total: 'මුළු එකතුව',
    updateProduct: 'නිෂ්පාදනය යාවත්කාලීන කරන්න',
  },
  ta: {
    add: 'சேர்',
    addProduct: 'பொருள் சேர்',
    auditLogs: 'தணிக்கை பதிவுகள்',
    backupExport: 'காப்பு / ஏற்றுமதி',
    balance: 'இருப்பு',
    balanceDue: 'செலுத்த வேண்டிய இருப்பு',
    change: 'மீதம்',
    creditBalance: 'கடன் இருப்பு',
    creditBook: 'கடன் புத்தகம்',
    dashboard: 'முகப்புப் பலகை',
    delete: 'நீக்கு',
    deleting: 'நீக்குகிறது...',
    discount: 'தள்ளுபடி',
    downloadPdf: 'PDF பதிவிறக்கு',
    edit: 'திருத்து',
    editProduct: 'பொருள் திருத்து',
    english: 'ஆங்கிலம்',
    language: 'மொழி',
    login: 'உள்நுழை',
    logout: 'வெளியேறு',
    paid: 'செலுத்தியது',
    paidAmount: 'செலுத்திய தொகை',
    paymentMethod: 'கட்டண முறை',
    paymentStatus: 'கட்டண நிலை',
    paymentVerification: 'கட்டணம் சரிபார்ப்பு',
    posBilling: 'POS பில்லிங்',
    print: 'அச்சிடு',
    products: 'பொருட்கள்',
    receipt: 'ரசீது',
    refresh: 'புதுப்பி',
    refreshing: 'புதுப்பிக்கிறது...',
    reports: 'அறிக்கைகள்',
    save: 'சேமி',
    saveSettings: 'அமைப்புகளை சேமி',
    saving: 'சேமிக்கிறது...',
    settings: 'அமைப்புகள்',
    sinhala: 'சிங்களம்',
    staff: 'பணியாளர்கள்',
    stock: 'இருப்பு',
    subtotal: 'கூட்டுத்தொகை',
    suppliers: 'வழங்குநர்கள்',
    tamil: 'தமிழ்',
    total: 'மொத்தம்',
    updateProduct: 'பொருள் புதுப்பி',
  },
}

export const normalizeLanguage = (language) =>
  supportedLanguages.includes(language) ? language : defaultLanguage

export const getLanguage = () => {
  if (typeof window === 'undefined') return defaultLanguage

  let settings = {}

  try {
    settings = JSON.parse(window.localStorage.getItem('shopSettings') || '{}')
  } catch {
    settings = {}
  }

  return normalizeLanguage(window.localStorage.getItem('language') || settings.language)
}

export const setLanguage = (language) => {
  if (typeof window === 'undefined') return defaultLanguage

  const nextLanguage = normalizeLanguage(language)
  window.localStorage.setItem('language', nextLanguage)
  window.dispatchEvent(new Event('shopmate:language-changed'))
  return nextLanguage
}

export const t = (key) => {
  const language = getLanguage()
  return translations[language]?.[key] || translations.en[key] || key
}
