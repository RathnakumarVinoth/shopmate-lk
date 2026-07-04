const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");
const { ensureShopSettingsColumns } = require("../utils/shopSchema");

const isMissing = (value) =>
  value === undefined || value === null || String(value).trim() === "";

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const isNonNegativeNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) >= 0;

const isIntegerInRange = (value, min, max) =>
  Number.isInteger(Number(value)) &&
  Number(value) >= min &&
  Number(value) <= max;

const receiptSizes = ["58mm", "80mm"];

const normalizeReceiptSize = (value) =>
  receiptSizes.includes(value) ? value : "80mm";

const languages = ["en", "si", "ta"];

const normalizeLanguage = (value) => (languages.includes(value) ? value : "en");

const getShopSettings = async (shopId) => {
  await ensureShopSettingsColumns();

  const [shops] = await db.promise().query(
    `SELECT shop_name, phone, email, address, receipt_footer, currency,
            default_low_stock_limit, tax_percentage, logo_url, default_receipt_size,
            language, idle_timeout_minutes, background_logout_minutes
     FROM shops
     WHERE id = ?
     LIMIT 1`,
    [shopId]
  );

  return shops[0] || null;
};

exports.getSettings = async (req, res) => {
  try {
    const settings = await getShopSettings(req.user.shop_id);

    if (!settings) {
      return res.status(404).json({ message: "Shop settings not found" });
    }

    return res.json({
      ...settings,
      currency: settings.currency || "LKR",
      default_low_stock_limit: Number(settings.default_low_stock_limit || 0),
      tax_percentage: Number(settings.tax_percentage || 0),
      default_receipt_size: normalizeReceiptSize(settings.default_receipt_size),
      language: normalizeLanguage(settings.language),
      idle_timeout_minutes: Number(settings.idle_timeout_minutes || 15),
      background_logout_minutes: Number(settings.background_logout_minutes || 3),
    });
  } catch (error) {
    console.error("Get settings error:", error.message);
    return res.status(500).json({ message: "Server error while fetching settings" });
  }
};

exports.getSecuritySettings = async (req, res) => {
  try {
    const settings = await getShopSettings(req.user.shop_id);

    if (!settings) {
      return res.status(404).json({ message: "Shop settings not found" });
    }

    return res.json({
      idle_timeout_minutes: Number(settings.idle_timeout_minutes || 15),
      background_logout_minutes: Number(
        settings.background_logout_minutes || 3
      ),
    });
  } catch (error) {
    console.error("Get security settings error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching security settings" });
  }
};

exports.updateSecuritySettings = async (req, res) => {
  const { idle_timeout_minutes, background_logout_minutes } = req.body;

  if (!isIntegerInRange(idle_timeout_minutes, 1, 480)) {
    return res
      .status(400)
      .json({ message: "idle_timeout_minutes must be between 1 and 480" });
  }

  if (!isIntegerInRange(background_logout_minutes, 1, 60)) {
    return res
      .status(400)
      .json({ message: "background_logout_minutes must be between 1 and 60" });
  }

  try {
    await ensureShopSettingsColumns();

    const [result] = await db.promise().query(
      `UPDATE shops
       SET idle_timeout_minutes = ?,
           background_logout_minutes = ?
       WHERE id = ?`,
      [
        Number(idle_timeout_minutes),
        Number(background_logout_minutes),
        req.user.shop_id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Shop settings not found" });
    }

    await createAuditLogFromRequest(req, {
      action: "security_settings_update",
      entity_type: "settings",
      entity_id: req.user.shop_id,
      description: "Updated session security settings",
    });

    return res.json({
      message: "Security settings updated successfully",
      settings: {
        idle_timeout_minutes: Number(idle_timeout_minutes),
        background_logout_minutes: Number(background_logout_minutes),
      },
    });
  } catch (error) {
    console.error("Update security settings error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while updating security settings" });
  }
};

exports.updateSettings = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Shop settings are managed by Master Admin. Please contact support.",
    });
  }

  const targetShopId = req.body.shop_id || req.query.shop_id;

  if (!Number.isInteger(Number(targetShopId)) || Number(targetShopId) <= 0) {
    return res.status(403).json({ message: "Shop context is required" });
  }

  const targetShopIdNumber = Number(targetShopId);

  const {
    shop_name,
    phone,
    email,
    address,
    receipt_footer,
    currency,
    default_low_stock_limit,
    tax_percentage,
    logo_url,
    default_receipt_size,
    language,
    idle_timeout_minutes,
    background_logout_minutes,
  } = req.body;

  if (isMissing(shop_name)) {
    return res.status(400).json({ message: "shop_name is required" });
  }

  if (!isNonNegativeNumber(default_low_stock_limit ?? 0)) {
    return res
      .status(400)
      .json({ message: "default_low_stock_limit must be 0 or greater" });
  }

  if (!isNonNegativeNumber(tax_percentage ?? 0)) {
    return res.status(400).json({ message: "tax_percentage must be 0 or greater" });
  }

  if (
    default_receipt_size !== undefined &&
    !receiptSizes.includes(default_receipt_size)
  ) {
    return res
      .status(400)
      .json({ message: "default_receipt_size must be 58mm or 80mm" });
  }

  if (language !== undefined && !languages.includes(language)) {
    return res.status(400).json({ message: "language must be en, si, or ta" });
  }

  if (
    idle_timeout_minutes !== undefined &&
    !isIntegerInRange(idle_timeout_minutes, 1, 480)
  ) {
    return res
      .status(400)
      .json({ message: "idle_timeout_minutes must be between 1 and 480" });
  }

  if (
    background_logout_minutes !== undefined &&
    !isIntegerInRange(background_logout_minutes, 1, 60)
  ) {
    return res
      .status(400)
      .json({ message: "background_logout_minutes must be between 1 and 60" });
  }

  const nextReceiptSize =
    default_receipt_size === undefined ? null : normalizeReceiptSize(default_receipt_size);
  const nextLanguage = language === undefined ? null : normalizeLanguage(language);
  const nextIdleTimeout =
    idle_timeout_minutes !== undefined ? Number(idle_timeout_minutes) : null;
  const nextBackgroundTimeout =
    background_logout_minutes !== undefined ? Number(background_logout_minutes) : null;

  try {
    await ensureShopSettingsColumns();

    const [result] = await db.promise().query(
      `UPDATE shops
       SET shop_name = ?, phone = ?, email = ?, address = ?, receipt_footer = ?,
           currency = ?, default_low_stock_limit = ?, tax_percentage = ?, logo_url = ?,
           default_receipt_size = COALESCE(?, default_receipt_size),
           language = COALESCE(?, language),
           idle_timeout_minutes = COALESCE(?, idle_timeout_minutes),
           background_logout_minutes = COALESCE(?, background_logout_minutes)
       WHERE id = ?`,
      [
        String(shop_name).trim(),
        optionalText(phone),
        optionalText(email),
        optionalText(address),
        optionalText(receipt_footer),
        optionalText(currency) || "LKR",
        Number(default_low_stock_limit || 0),
        Number(tax_percentage || 0),
        optionalText(logo_url),
        nextReceiptSize,
        nextLanguage,
        nextIdleTimeout,
        nextBackgroundTimeout,
        targetShopIdNumber,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Shop settings not found" });
    }

    const settings = await getShopSettings(targetShopIdNumber);

    await createAuditLogFromRequest(req, {
      action: "settings_update",
      entity_type: "settings",
      entity_id: targetShopIdNumber,
      description: `Updated shop settings for ${settings.shop_name}`,
    });

    return res.json({
      message: "Settings updated successfully",
      settings: {
        ...settings,
        currency: settings.currency || "LKR",
        default_low_stock_limit: Number(settings.default_low_stock_limit || 0),
        tax_percentage: Number(settings.tax_percentage || 0),
        default_receipt_size: normalizeReceiptSize(settings.default_receipt_size),
        language: normalizeLanguage(settings.language),
        idle_timeout_minutes: Number(settings.idle_timeout_minutes || 15),
        background_logout_minutes: Number(settings.background_logout_minutes || 3),
      },
    });
  } catch (error) {
    console.error("Update settings error:", error.message);
    return res.status(500).json({ message: "Server error while updating settings" });
  }
};
