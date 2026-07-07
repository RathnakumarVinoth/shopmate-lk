const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { getEffectivePermissions } = require("../utils/permissions");
const { ensureSaasSchema } = require("../utils/saasSchema");
const { getShopAccessError } = require("../utils/shopAccess");
const { normalizeEnabledModules, normalizeShopType } = require("../utils/shopModules");

const normalizeUser = (user, shop = null) => ({
  id: user.id,
  name: user.name,
  username: user.username || null,
  email: user.email || null,
  role: user.role,
  shop_id: user.shop_id || null,
  permissions: getEffectivePermissions(user),
  shop,
});

const normalizeShop = (shop) =>
  shop
    ? {
        id: shop.id,
        shop_id: shop.id,
        shop_name: shop.shop_name,
        shop_code: shop.shop_code || null,
        shop_type: normalizeShopType(shop.shop_type),
        enabled_modules: normalizeEnabledModules(shop.enabled_modules, shop.shop_type),
        is_enabled: shop.is_enabled,
        subscription_status: shop.subscription_status || null,
        subscription_expiry_date: shop.subscription_expiry_date || null,
      }
    : null;

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const tokenUserId = Number(decoded.id);

  if (!Number.isInteger(tokenUserId) || tokenUserId <= 0) {
    return res.status(401).json({ message: "Invalid token" });
  }

  try {
    await ensureSaasSchema();

    const [users] = await db.promise().query(
      `SELECT id, name, username, email, role, permissions, shop_id, is_active
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [tokenUserId]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = users[0];

    if (Number(user.is_active ?? 1) === 0) {
      return res.status(403).json({ message: "Account is inactive" });
    }

    if (user.role === "admin") {
      req.user = normalizeUser(user);
      return next();
    }

    const tokenShopId = Number(decoded.shop_id);
    const userShopId = Number(user.shop_id);

    if (
      !Number.isInteger(tokenShopId) ||
      tokenShopId <= 0 ||
      !Number.isInteger(userShopId) ||
      userShopId <= 0 ||
      userShopId !== tokenShopId
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [shops] = await db.promise().query(
      `SELECT id, shop_name, shop_code, is_enabled, subscription_status,
              subscription_expiry_date, shop_type, enabled_modules
       FROM shops
       WHERE id = ?
       LIMIT 1`,
      [userShopId]
    );
    const shop = shops[0] || null;
    const accessError = getShopAccessError(shop);

    if (accessError) {
      const status = accessError.status === 404 ? 403 : accessError.status;
      return res.status(status).json({ message: accessError.message });
    }

    const normalizedShop = normalizeShop(shop);
    req.shop = normalizedShop;
    req.user = normalizeUser(user, normalizedShop);
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return res.status(500).json({ message: "Server error during authentication" });
  }
};
