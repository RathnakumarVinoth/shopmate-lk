const SHOP_TYPES = ["grocery", "hardware", "mobile_repair", "clothing", "custom"];

const MODULE_KEYS = [
  "pos",
  "products",
  "stock",
  "barcode",
  "customers",
  "credit_book",
  "suppliers",
  "purchasing",
  "grn",
  "expenses",
  "reports",
  "backup",
  "staff",
  "notifications",
  "receipt_printing",
  "low_stock",
  "expiry_batch",
  "quotations",
  "delivery_notes",
  "unit_conversion",
  "imei_serial",
  "warranty",
  "repair_jobs",
  "technician_status",
  "advance_payments",
  "parts_used",
  "pickup_receipt",
  "product_variants",
  "size_color",
  "barcode_labels",
  "returns_exchange",
  "discounts_promotions",
];

const CURRENT_CORE_MODULES = [
  "pos",
  "products",
  "stock",
  "barcode",
  "customers",
  "credit_book",
  "suppliers",
  "purchasing",
  "grn",
  "expenses",
  "reports",
  "backup",
  "staff",
  "notifications",
  "receipt_printing",
  "low_stock",
  "returns_exchange",
];

const defaultModulesByShopType = {
  grocery: [
    "pos",
    "products",
    "stock",
    "barcode",
    "credit_book",
    "suppliers",
    "expenses",
    "reports",
    "backup",
    "receipt_printing",
    "low_stock",
  ],
  hardware: [
    "pos",
    "products",
    "stock",
    "customers",
    "credit_book",
    "suppliers",
    "purchasing",
    "grn",
    "quotations",
    "delivery_notes",
    "unit_conversion",
    "expenses",
    "reports",
    "backup",
    "receipt_printing",
  ],
  mobile_repair: [
    "pos",
    "products",
    "stock",
    "customers",
    "imei_serial",
    "warranty",
    "repair_jobs",
    "technician_status",
    "advance_payments",
    "parts_used",
    "reports",
    "backup",
    "receipt_printing",
    "pickup_receipt",
  ],
  clothing: [
    "pos",
    "products",
    "stock",
    "product_variants",
    "size_color",
    "barcode_labels",
    "customers",
    "returns_exchange",
    "discounts_promotions",
    "reports",
    "backup",
    "receipt_printing",
  ],
  custom: CURRENT_CORE_MODULES,
};

const moduleSet = new Set(MODULE_KEYS);
const shopTypeSet = new Set(SHOP_TYPES);

const normalizeShopType = (value) => {
  const normalized = String(value || "custom").trim().toLowerCase();
  return shopTypeSet.has(normalized) ? normalized : "custom";
};

const isValidShopType = (value) =>
  shopTypeSet.has(String(value || "").trim().toLowerCase());

const getDefaultModulesForShopType = (shopType = "custom") => [
  ...(defaultModulesByShopType[normalizeShopType(shopType)] || CURRENT_CORE_MODULES),
];

const parseEnabledModules = (value) => {
  if (Array.isArray(value)) return value;

  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeEnabledModules = (value, shopType = "custom") => {
  const rawModules = parseEnabledModules(value) || getDefaultModulesForShopType(shopType);
  const uniqueModules = [];

  for (const moduleKey of rawModules) {
    const normalized = String(moduleKey || "").trim().toLowerCase();
    if (moduleSet.has(normalized) && !uniqueModules.includes(normalized)) {
      uniqueModules.push(normalized);
    }
  }

  return uniqueModules;
};

const serializeEnabledModules = (value, shopType = "custom") =>
  JSON.stringify(normalizeEnabledModules(value, shopType));

const isModuleEnabled = (shopOrModules, moduleKey) => {
  if (!moduleKey) return true;

  const modules = Array.isArray(shopOrModules)
    ? normalizeEnabledModules(shopOrModules)
    : normalizeEnabledModules(
        shopOrModules?.enabled_modules,
        shopOrModules?.shop_type || "custom"
      );

  return modules.includes(moduleKey);
};

module.exports = {
  CURRENT_CORE_MODULES,
  MODULE_KEYS,
  SHOP_TYPES,
  defaultModulesByShopType,
  getDefaultModulesForShopType,
  isModuleEnabled,
  isValidShopType,
  normalizeEnabledModules,
  normalizeShopType,
  serializeEnabledModules,
};
