const db = require("../config/db");

const permissions = [
  "dashboard_view",
  "products_view",
  "products_manage",
  "pos_access",
  "credit_book_access",
  "suppliers_access",
  "stock_access",
  "purchase_suggestions_access",
  "returns_access",
  "expenses_access",
  "reports_access",
  "payment_verification_access",
  "audit_logs_access",
  "backup_export_access",
  "settings_access",
  "staff_manage",
];

const staffRoles = ["staff", "cashier", "stock_keeper", "manager"];

const rolePermissions = {
  owner: permissions,
  admin: permissions,
  cashier: [
    "products_view",
    "pos_access",
  ],
  stock_keeper: [
    "dashboard_view",
    "products_view",
    "products_manage",
    "stock_access",
    "purchase_suggestions_access",
  ],
  manager: [
    "dashboard_view",
    "products_view",
    "pos_access",
    "reports_access",
    "stock_access",
    "expenses_access",
    "suppliers_access",
  ],
  staff: [
    "dashboard_view",
    "products_view",
    "pos_access",
  ],
};

let ensuredUserPermissionColumns = false;

const ensureUserPermissionColumns = async () => {
  if (ensuredUserPermissionColumns) return;

  const connection = db.promise();
  await connection.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(50)");

  const [columns] = await connection.query("SHOW COLUMNS FROM users");
  const existingColumns = new Set(columns.map((column) => column.Field));

  if (!existingColumns.has("permissions")) {
    await connection.query("ALTER TABLE users ADD COLUMN permissions TEXT NULL");
  }

  ensuredUserPermissionColumns = true;
};

const parsePermissions = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value)
      .split(",")
      .map((permission) => permission.trim())
      .filter(Boolean);
  }
};

const normalizePermissions = (value) => {
  const allowed = new Set(permissions);
  return [...new Set(parsePermissions(value).filter((permission) => allowed.has(permission)))];
};

const serializePermissions = (value) => JSON.stringify(normalizePermissions(value));

const getRolePermissions = (role) => rolePermissions[role] || rolePermissions.staff;

const getEffectivePermissions = (user) => {
  if (!user) return [];
  if (user.role === "owner" || user.role === "admin") return permissions;

  if (user.permissions !== undefined && user.permissions !== null && user.permissions !== "") {
    return normalizePermissions(user.permissions);
  }

  return getRolePermissions(user.role);
};

const hasPermission = (user, permissionName) =>
  getEffectivePermissions(user).includes(permissionName);

module.exports = {
  ensureUserPermissionColumns,
  getEffectivePermissions,
  getRolePermissions,
  hasPermission,
  normalizePermissions,
  permissions,
  serializePermissions,
  staffRoles,
};
