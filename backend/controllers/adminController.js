const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");
const {
  getRolePermissions,
  normalizePermissions,
  serializePermissions,
  staffRoles,
} = require("../utils/permissions");
const { ensureSaasSchema } = require("../utils/saasSchema");
const { validateStrongPassword } = require("../utils/security");

const allowedPlans = ["starter", "business", "pro"];
const allowedStatuses = ["trial", "active", "expired", "suspended"];
const receiptSizes = ["58mm", "80mm"];
const languages = ["en", "si", "ta"];
const userRoles = ["owner", ...staffRoles];

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const isNonNegativeNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) >= 0;

const optionalDate = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).slice(0, 10);
};

const toBooleanNumber = (value) => {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return 1;
  }

  if (value === false || value === 0 || value === "0" || value === "false") {
    return 0;
  }

  return null;
};

const toNumber = (value) => Number(value || 0);
const optionalText = (value) =>
  value === undefined || value === null || String(value).trim() === ""
    ? null
    : String(value).trim();

const generateTemporaryPassword = () =>
  `ShopMate#${Math.random().toString(36).slice(2, 8)}${Math.floor(1000 + Math.random() * 9000)}`;

const normalizeReceiptSize = (value) =>
  receiptSizes.includes(value) ? value : "80mm";

const normalizeLanguage = (value) => (languages.includes(value) ? value : "en");

const formatShop = (shop) => ({
  id: shop.id,
  shop_id: shop.id,
  shop_name: shop.shop_name,
  shop_code: shop.shop_code || null,
  login_email: shop.login_email || null,
  owner_name: shop.owner_name || null,
  owner_email: shop.owner_email || null,
  phone: shop.phone || null,
  email: shop.email || null,
  address: shop.address || null,
  receipt_footer: shop.receipt_footer || null,
  logo_url: shop.logo_url || null,
  currency: shop.currency || "LKR",
  default_low_stock_limit: Number(shop.default_low_stock_limit || 5),
  tax_percentage: toNumber(shop.tax_percentage),
  default_receipt_size: normalizeReceiptSize(shop.default_receipt_size),
  language: normalizeLanguage(shop.language),
  subscription_plan: shop.subscription_plan || null,
  subscription_status: shop.subscription_status || null,
  subscription_start_date: shop.subscription_start_date || null,
  subscription_expiry_date: shop.subscription_expiry_date || null,
  monthly_fee: toNumber(shop.monthly_fee),
  is_enabled: Boolean(Number(shop.is_enabled ?? 1)),
  created_at: shop.created_at,
});

const getShopById = async (shopId) => {
  await ensureSaasSchema();

  const [shops] = await db.promise().query(
    `SELECT
       shops.id,
       shops.shop_name,
       shops.shop_code,
       shops.login_email,
       shops.owner_name AS stored_owner_name,
       shops.phone,
       shops.email,
       shops.address,
       shops.receipt_footer,
       shops.logo_url,
       shops.currency,
       shops.default_low_stock_limit,
       shops.tax_percentage,
       shops.default_receipt_size,
       shops.language,
       shops.subscription_plan,
       shops.subscription_status,
       shops.subscription_start_date,
       shops.subscription_expiry_date,
       shops.monthly_fee,
       shops.is_enabled,
       shops.created_at,
       owners.id AS owner_id,
       COALESCE(shops.owner_name, owners.name) AS owner_name,
       owners.email AS owner_email
     FROM shops
     LEFT JOIN users AS owners ON owners.id = shops.owner_id
     WHERE shops.id = ?
     LIMIT 1`,
    [shopId]
  );

  return shops[0] || null;
};

exports.getShops = async (req, res) => {
  try {
    await ensureSaasSchema();

    const [shops] = await db.promise().query(
      `SELECT
         shops.id,
         shops.shop_name,
         shops.shop_code,
         shops.login_email,
         shops.phone,
         shops.email,
         shops.address,
         shops.receipt_footer,
         shops.logo_url,
         shops.currency,
         shops.default_low_stock_limit,
         shops.tax_percentage,
         shops.default_receipt_size,
         shops.language,
         shops.subscription_plan,
         shops.subscription_status,
         shops.subscription_start_date,
         shops.subscription_expiry_date,
         shops.monthly_fee,
         shops.is_enabled,
         shops.created_at,
         COALESCE(shops.owner_name, owners.name) AS owner_name,
         owners.email AS owner_email
       FROM shops
       LEFT JOIN users AS owners ON owners.id = shops.owner_id
       ORDER BY shops.id DESC`
    );

    return res.json({
      message: "Shops fetched successfully",
      shops: shops.map(formatShop),
    });
  } catch (error) {
    console.error("Get admin shops error:", error.message);
    return res.status(500).json({ message: "Server error while fetching shops" });
  }
};

exports.createShop = async (req, res) => {
  const {
    shop_name,
    owner_name,
    login_email,
    login_password,
    owner_username,
    owner_password,
    phone,
    email,
    address,
    receipt_footer,
    logo_url,
    language,
    currency,
    default_low_stock_limit,
    tax_percentage,
    default_receipt_size,
    subscription_plan,
    subscription_status,
    subscription_start_date,
    subscription_expiry_date,
    monthly_fee,
    is_enabled,
  } = req.body;

  const errors = [];
  if (!optionalText(shop_name)) errors.push("shop_name is required");
  if (!optionalText(owner_name)) errors.push("owner_name is required");
  if (!optionalText(login_email)) errors.push("shop login email is required");
  if (!optionalText(owner_username)) errors.push("owner username is required");

  const shopPassword = optionalText(login_password) || generateTemporaryPassword();
  const rolePassword = optionalText(owner_password) || generateTemporaryPassword();
  const shopPasswordError = validateStrongPassword(shopPassword);
  const rolePasswordError = validateStrongPassword(rolePassword);

  if (shopPasswordError) errors.push(`shop login password: ${shopPasswordError}`);
  if (rolePasswordError) errors.push(`owner password: ${rolePasswordError}`);

  const plan = allowedPlans.includes(subscription_plan) ? subscription_plan : "starter";
  const status = allowedStatuses.includes(subscription_status) ? subscription_status : "trial";
  const enabledValue = toBooleanNumber(is_enabled === undefined ? true : is_enabled);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  const connection = db.promise();

  try {
    await ensureSaasSchema();
    await connection.beginTransaction();

    const shopCode = `SHOP-${Date.now().toString(36).toUpperCase()}`;
    const shopPasswordHash = await bcrypt.hash(shopPassword, 10);
    const ownerPasswordHash = await bcrypt.hash(rolePassword, 10);

    const [shopResult] = await connection.query(
      `INSERT INTO shops
       (shop_name, owner_name, login_email, login_password_hash, shop_code,
        phone, email, address, receipt_footer, logo_url, language, currency,
        default_low_stock_limit, tax_percentage,
        default_receipt_size, subscription_plan, subscription_status,
        subscription_start_date, subscription_expiry_date, monthly_fee,
        is_enabled, created_by_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        optionalText(shop_name),
        optionalText(owner_name),
        optionalText(login_email).toLowerCase(),
        shopPasswordHash,
        shopCode,
        optionalText(phone),
        optionalText(email),
        optionalText(address),
        optionalText(receipt_footer),
        optionalText(logo_url),
        normalizeLanguage(language),
        optionalText(currency) || "LKR",
        Number(default_low_stock_limit || 5),
        Number(tax_percentage || 0),
        normalizeReceiptSize(default_receipt_size),
        plan,
        status,
        optionalDate(subscription_start_date),
        optionalDate(subscription_expiry_date),
        Number(monthly_fee || 0),
        enabledValue === null ? 1 : enabledValue,
        req.user.id,
      ]
    );

    const shopId = shopResult.insertId;
    const [ownerResult] = await connection.query(
      `INSERT INTO users
       (name, username, email, password, role, permissions, shop_id, is_active)
       VALUES (?, ?, ?, ?, 'owner', ?, ?, 1)`,
      [
        optionalText(owner_name),
        optionalText(owner_username),
        optionalText(email),
        ownerPasswordHash,
        serializePermissions(getRolePermissions("owner")),
        shopId,
      ]
    );

    await connection.query("UPDATE shops SET owner_id = ? WHERE id = ?", [
      ownerResult.insertId,
      shopId,
    ]);

    await connection.commit();

    await createAuditLogFromRequest(req, {
      shop_id: shopId,
      action: "shop_created",
      entity_type: "shop",
      entity_id: shopId,
      description: `Created shop ${optionalText(shop_name)}`,
    });

    const createdShop = await getShopById(shopId);

    return res.status(201).json({
      message: "Shop created successfully",
      shop: formatShop(createdShop),
      credentials: {
        shop_login_email: optionalText(login_email).toLowerCase(),
        shop_temporary_password: shopPassword,
        owner_username: optionalText(owner_username),
        owner_temporary_password: rolePassword,
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Create shop rollback failed:", rollbackError.message);
    }

    console.error("Create shop error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Shop login email, shop code, or username already exists" });
    }

    return res.status(500).json({ message: "Server error while creating shop" });
  }
};

exports.getShopDetails = async (req, res) => {
  const shopId = req.params.id;

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  try {
    const shop = await getShopById(shopId);

    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const [
      [productRows],
      [salesRows],
      [staffRows],
      [customerRows],
      [revenueRows],
    ] = await Promise.all([
      db.promise().query("SELECT COUNT(*) AS total_products FROM products WHERE shop_id = ?", [
        shopId,
      ]),
      db.promise().query("SELECT COUNT(*) AS total_sales FROM sales WHERE shop_id = ?", [
        shopId,
      ]),
      db.promise().query(
        "SELECT COUNT(*) AS total_staff FROM users WHERE shop_id = ? AND role IN (?)",
        [shopId, staffRoles]
      ),
      db.promise().query(
        "SELECT COUNT(*) AS total_customers FROM customers WHERE shop_id = ?",
        [shopId]
      ),
      db.promise().query(
        "SELECT COALESCE(SUM(total_amount), 0) AS total_revenue FROM sales WHERE shop_id = ?",
        [shopId]
      ),
    ]);

    return res.json({
      message: "Shop details fetched successfully",
      shop: {
        ...formatShop(shop),
        owner_id: shop.owner_id || null,
        address: shop.address || null,
      },
      usage: {
        total_products: Number(productRows[0].total_products || 0),
        total_sales: Number(salesRows[0].total_sales || 0),
        total_staff: Number(staffRows[0].total_staff || 0),
        total_customers: Number(customerRows[0].total_customers || 0),
        total_revenue: toNumber(revenueRows[0].total_revenue),
      },
    });
  } catch (error) {
    console.error("Get admin shop details error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching shop details" });
  }
};

exports.updateSubscription = async (req, res) => {
  const shopId = req.params.id;
  const {
    subscription_plan,
    subscription_status,
    subscription_start_date,
    subscription_expiry_date,
    monthly_fee,
    is_enabled,
  } = req.body;
  const errors = [];

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  if (!allowedPlans.includes(subscription_plan)) {
    errors.push("subscription_plan must be starter, business, or pro");
  }

  if (!allowedStatuses.includes(subscription_status)) {
    errors.push("subscription_status must be trial, active, expired, or suspended");
  }

  if (!isNonNegativeNumber(monthly_fee)) {
    errors.push("monthly_fee must be greater than or equal to 0");
  }

  const enabledValue = toBooleanNumber(is_enabled);

  if (enabledValue === null) {
    errors.push("is_enabled must be true or false");
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    await ensureSaasSchema();

    const [result] = await db.promise().query(
      `UPDATE shops
       SET subscription_plan = ?,
           subscription_status = ?,
           subscription_start_date = ?,
           subscription_expiry_date = ?,
           monthly_fee = ?,
           is_enabled = ?
       WHERE id = ?`,
      [
        subscription_plan,
        subscription_status,
        optionalDate(subscription_start_date),
        optionalDate(subscription_expiry_date),
        Number(monthly_fee),
        enabledValue,
        shopId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const updatedShop = await getShopById(shopId);

    return res.json({
      message: "Subscription updated successfully",
      shop: formatShop(updatedShop),
    });
  } catch (error) {
    console.error("Update subscription error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while updating subscription" });
  }
};

exports.updateShop = async (req, res) => {
  const shopId = req.params.id;
  const {
    shop_name,
    owner_name,
    login_email,
    phone,
    email,
    address,
    receipt_footer,
    logo_url,
    language,
    currency,
    default_low_stock_limit,
    tax_percentage,
    default_receipt_size,
    subscription_plan,
    subscription_status,
    subscription_start_date,
    subscription_expiry_date,
    monthly_fee,
    is_enabled,
  } = req.body;

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  if (!optionalText(shop_name) || !optionalText(owner_name) || !optionalText(login_email)) {
    return res
      .status(400)
      .json({ message: "shop_name, owner_name, and login_email are required" });
  }

  const enabledValue = toBooleanNumber(is_enabled === undefined ? true : is_enabled);

  try {
    await ensureSaasSchema();

    const [result] = await db.promise().query(
      `UPDATE shops
       SET shop_name = ?, owner_name = ?, login_email = ?, phone = ?, email = ?,
           address = ?, receipt_footer = ?, logo_url = ?, language = ?, currency = ?,
           default_low_stock_limit = ?, tax_percentage = ?,
           default_receipt_size = ?, subscription_plan = ?,
           subscription_status = ?, subscription_start_date = ?,
           subscription_expiry_date = ?, monthly_fee = ?, is_enabled = ?
       WHERE id = ?`,
      [
        optionalText(shop_name),
        optionalText(owner_name),
        optionalText(login_email).toLowerCase(),
        optionalText(phone),
        optionalText(email),
        optionalText(address),
        optionalText(receipt_footer),
        optionalText(logo_url),
        normalizeLanguage(language),
        optionalText(currency) || "LKR",
        Number(default_low_stock_limit || 5),
        Number(tax_percentage || 0),
        normalizeReceiptSize(default_receipt_size),
        allowedPlans.includes(subscription_plan) ? subscription_plan : "starter",
        allowedStatuses.includes(subscription_status) ? subscription_status : "trial",
        optionalDate(subscription_start_date),
        optionalDate(subscription_expiry_date),
        Number(monthly_fee || 0),
        enabledValue === null ? 1 : enabledValue,
        shopId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const updatedShop = await getShopById(shopId);

    await createAuditLogFromRequest(req, {
      shop_id: Number(shopId),
      action: "shop_settings_updated",
      entity_type: "shop",
      entity_id: Number(shopId),
      description: `Updated shop settings for ${updatedShop.shop_name}`,
    });

    return res.json({
      message: "Shop updated successfully",
      shop: formatShop(updatedShop),
    });
  } catch (error) {
    console.error("Update shop error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Shop login email already exists" });
    }

    return res.status(500).json({ message: "Server error while updating shop" });
  }
};

const formatAdminUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email || null,
  role: user.role,
  permissions: normalizePermissions(user.permissions),
  shop_id: user.shop_id,
  is_active: Boolean(Number(user.is_active ?? 1)),
  created_at: user.created_at,
});

exports.getShopUsers = async (req, res) => {
  const shopId = req.params.id;

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  try {
    await ensureSaasSchema();

    const [users] = await db.promise().query(
      `SELECT id, name, username, email, role, permissions, shop_id, is_active, created_at
       FROM users
       WHERE shop_id = ? AND role IN (?)
       ORDER BY role = 'owner' DESC, id DESC`,
      [shopId, userRoles]
    );

    return res.json({
      message: "Shop users fetched successfully",
      users: users.map(formatAdminUser),
    });
  } catch (error) {
    console.error("Get shop users error:", error.message);
    return res.status(500).json({ message: "Server error while fetching shop users" });
  }
};

exports.createShopUser = async (req, res) => {
  const shopId = req.params.id;
  const { name, username, email, password, role, permissions } = req.body;

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  const nextRole = userRoles.includes(role) ? role : "staff";
  const temporaryPassword = optionalText(password) || generateTemporaryPassword();
  const passwordError = validateStrongPassword(temporaryPassword);

  if (!optionalText(name) || !optionalText(username)) {
    return res.status(400).json({ message: "name and username are required" });
  }

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    await ensureSaasSchema();

    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const userPermissions =
      permissions === undefined
        ? getRolePermissions(nextRole)
        : normalizePermissions(permissions);

    const [result] = await db.promise().query(
      `INSERT INTO users
       (name, username, email, password, role, permissions, shop_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        optionalText(name),
        optionalText(username),
        optionalText(email),
        hashedPassword,
        nextRole,
        serializePermissions(userPermissions),
        shopId,
      ]
    );

    await createAuditLogFromRequest(req, {
      shop_id: Number(shopId),
      action: "admin_user_created",
      entity_type: "user",
      entity_id: result.insertId,
      description: `Created ${nextRole} user ${optionalText(username)}`,
    });

    return res.status(201).json({
      message: "User created successfully",
      user_id: result.insertId,
      temporary_password: temporaryPassword,
    });
  } catch (error) {
    console.error("Create shop user error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Username already exists for this shop" });
    }

    return res.status(500).json({ message: "Server error while creating user" });
  }
};

exports.updateShopUser = async (req, res) => {
  const { id: shopId, userId } = req.params;
  const { name, username, email, role, permissions, is_active } = req.body;

  if (!isPositiveInteger(shopId) || !isPositiveInteger(userId)) {
    return res.status(400).json({ message: "Valid shop and user ids are required" });
  }

  const nextRole = userRoles.includes(role) ? role : "staff";

  if (!optionalText(name) || !optionalText(username)) {
    return res.status(400).json({ message: "name and username are required" });
  }

  try {
    await ensureSaasSchema();

    const [result] = await db.promise().query(
      `UPDATE users
       SET name = ?, username = ?, email = ?, role = ?, permissions = ?, is_active = ?
       WHERE id = ? AND shop_id = ? AND role IN (?)`,
      [
        optionalText(name),
        optionalText(username),
        optionalText(email),
        nextRole,
        serializePermissions(
          permissions === undefined ? getRolePermissions(nextRole) : permissions
        ),
        is_active === false || is_active === 0 || is_active === "0" ? 0 : 1,
        userId,
        shopId,
        userRoles,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    await createAuditLogFromRequest(req, {
      shop_id: Number(shopId),
      action: "admin_user_updated",
      entity_type: "user",
      entity_id: Number(userId),
      description: `Updated shop user ${optionalText(username)}`,
    });

    return res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Update shop user error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Username already exists for this shop" });
    }

    return res.status(500).json({ message: "Server error while updating user" });
  }
};

exports.resetShopPassword = async (req, res) => {
  const shopId = req.params.id;
  const requestedPassword =
    optionalText(req.body?.newPassword) ||
    optionalText(req.body?.password) ||
    optionalText(req.body?.temporaryPassword);
  const temporaryPassword = requestedPassword || generateTemporaryPassword();
  const passwordError = validateStrongPassword(temporaryPassword);

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    await ensureSaasSchema();

    const [shops] = await db.promise().query(
      `SELECT id, shop_name, login_email, email
       FROM shops
       WHERE id = ?
       LIMIT 1`,
      [shopId]
    );

    if (shops.length === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const shop = shops[0];
    const loginEmail = optionalText(shop.login_email) || optionalText(shop.email);

    if (!loginEmail) {
      return res.status(400).json({
        message: "Shop login email is not set. Please edit the shop email first.",
      });
    }

    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const [result] = await db.promise().query(
      "UPDATE shops SET login_password_hash = ?, login_email = ? WHERE id = ?",
      [hashedPassword, loginEmail.toLowerCase(), shopId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    await createAuditLogFromRequest(req, {
      shop_id: Number(shopId),
      action: "shop_password_reset",
      entity_type: "shop",
      entity_id: Number(shopId),
      description: "Reset shop login password",
    });

    return res.json({
      message: "Shop password reset successfully",
      temporaryPassword,
      loginEmail: loginEmail.toLowerCase(),
      temporary_password: temporaryPassword,
      login_email: loginEmail.toLowerCase(),
    });
  } catch (error) {
    console.error("Reset shop password error:", error);
    return res.status(500).json({ message: "Server error while resetting shop password" });
  }
};

exports.resetShopUserPassword = async (req, res) => {
  const { id: shopId, userId } = req.params;
  const temporaryPassword = optionalText(req.body.password) || generateTemporaryPassword();
  const passwordError = validateStrongPassword(temporaryPassword);

  if (!isPositiveInteger(shopId) || !isPositiveInteger(userId)) {
    return res.status(400).json({ message: "Valid shop and user ids are required" });
  }

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    await ensureSaasSchema();

    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const [result] = await db.promise().query(
      "UPDATE users SET password = ? WHERE id = ? AND shop_id = ?",
      [hashedPassword, userId, shopId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    await createAuditLogFromRequest(req, {
      shop_id: Number(shopId),
      action: "user_password_reset",
      entity_type: "user",
      entity_id: Number(userId),
      description: "Reset shop user password",
    });

    return res.json({
      message: "User password reset successfully",
      temporary_password: temporaryPassword,
    });
  } catch (error) {
    console.error("Reset user password error:", error.message);
    return res.status(500).json({ message: "Server error while resetting user password" });
  }
};

exports.enableShop = async (req, res) => {
  const shopId = req.params.id;

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  try {
    await ensureSaasSchema();

    const [result] = await db
      .promise()
      .query("UPDATE shops SET is_enabled = 1 WHERE id = ?", [shopId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    return res.json({ message: "Shop enabled successfully" });
  } catch (error) {
    console.error("Enable shop error:", error.message);
    return res.status(500).json({ message: "Server error while enabling shop" });
  }
};

exports.disableShop = async (req, res) => {
  const shopId = req.params.id;

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  try {
    await ensureSaasSchema();

    const [result] = await db
      .promise()
      .query("UPDATE shops SET is_enabled = 0 WHERE id = ?", [shopId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    return res.json({ message: "Shop disabled successfully" });
  } catch (error) {
    console.error("Disable shop error:", error.message);
    return res.status(500).json({ message: "Server error while disabling shop" });
  }
};

exports.getSummary = async (req, res) => {
  try {
    await ensureSaasSchema();

    const [rows] = await db.promise().query(
      `SELECT
         COUNT(*) AS total_shops,
         COALESCE(SUM(CASE WHEN is_enabled = 1 AND subscription_status = 'active' THEN 1 ELSE 0 END), 0) AS active_shops,
         COALESCE(SUM(CASE WHEN subscription_status = 'trial' THEN 1 ELSE 0 END), 0) AS trial_shops,
         COALESCE(SUM(CASE WHEN subscription_status = 'expired' THEN 1 ELSE 0 END), 0) AS expired_shops,
         COALESCE(SUM(CASE WHEN subscription_status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended_shops,
         COALESCE(SUM(CASE WHEN is_enabled = 1 AND subscription_status IN ('active', 'trial') THEN monthly_fee ELSE 0 END), 0) AS estimated_monthly_revenue
       FROM shops`
    );

    const summary = rows[0] || {};

    return res.json({
      message: "Admin summary fetched successfully",
      summary: {
        total_shops: Number(summary.total_shops || 0),
        active_shops: Number(summary.active_shops || 0),
        trial_shops: Number(summary.trial_shops || 0),
        expired_shops: Number(summary.expired_shops || 0),
        suspended_shops: Number(summary.suspended_shops || 0),
        estimated_monthly_revenue: toNumber(summary.estimated_monthly_revenue),
      },
    });
  } catch (error) {
    console.error("Get admin summary error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching admin summary" });
  }
};
