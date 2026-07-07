const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const { createLoginActivity, ensureSecurityTables } = require("../utils/security");
const { ensureSaasSchema } = require("../utils/saasSchema");
const { getShopAccessError } = require("../utils/shopAccess");
const { normalizeEnabledModules, normalizeShopType } = require("../utils/shopModules");

const SHOP_SESSION_SECONDS = 30 * 60;

const getRequestMeta = (req) => ({
  ip_address: req.ip,
  user_agent: req.get("user-agent") || null,
});

const signShopToken = (shop) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      type: "shop",
      shop_id: shop.id,
      shop_name: shop.shop_name,
      shop_code: shop.shop_code || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: SHOP_SESSION_SECONDS }
  );
};

exports.shopLogin = async (req, res) => {
  const { login_email, email, password } = req.body;
  const shopEmail = String(login_email || email || "").trim().toLowerCase();

  if (!shopEmail || !password) {
    return res
      .status(400)
      .json({ message: "shop email and shop password are required" });
  }

  try {
    await ensureSaasSchema();
    await ensureSecurityTables();

    const [shops] = await db.promise().query(
      `SELECT id, shop_name, shop_code, login_email, login_password_hash,
              is_enabled, subscription_status, subscription_expiry_date,
              shop_type, enabled_modules
       FROM shops
       WHERE login_email = ?
       LIMIT 1`,
      [shopEmail]
    );

    if (shops.length === 0) {
      await createLoginActivity({
        email: shopEmail,
        status: "failed",
        message: "Invalid shop login",
        ...getRequestMeta(req),
      });
      return res.status(401).json({ message: "Invalid shop login" });
    }

    const shop = shops[0];

    if (!shop.login_password_hash) {
      await createLoginActivity({
        shop_id: shop.id,
        email: shop.login_email,
        status: "failed",
        message: "Shop password not set",
        ...getRequestMeta(req),
      });
      return res.status(401).json({
        message: "Shop password has not been set. Please ask admin to reset it.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, shop.login_password_hash);

    if (!passwordMatches) {
      await createLoginActivity({
        shop_id: shop.id,
        email: shop.login_email,
        status: "failed",
        message: "Invalid shop login",
        ...getRequestMeta(req),
      });
      return res.status(401).json({ message: "Invalid shop login" });
    }

    const accessError = getShopAccessError(shop);

    if (accessError) {
      await createLoginActivity({
        shop_id: shop.id,
        email: shop.login_email,
        status: "failed",
        message: accessError.message,
        ...getRequestMeta(req),
      });
      return res.status(accessError.status).json({ message: accessError.message });
    }

    const shopContext = {
      shop_id: shop.id,
      shop_name: shop.shop_name,
      shop_code: shop.shop_code || null,
      shop_type: normalizeShopType(shop.shop_type),
      enabled_modules: normalizeEnabledModules(shop.enabled_modules, shop.shop_type),
      shop_login_email: shop.login_email || null,
    };

    await createLoginActivity({
      shop_id: shop.id,
      email: shop.login_email,
      status: "shop_success",
      message: "Shop login success",
      ...getRequestMeta(req),
    });

    return res.json({
      message: "Shop login successful",
      shop_token: signShopToken(shop),
      shop: shopContext,
    });
  } catch (error) {
    console.error("Shop login error:", error);
    return res.status(500).json({ message: "Server error during shop login" });
  }
};
