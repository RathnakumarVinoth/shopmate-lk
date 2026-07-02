const db = require("../config/db");

const allowedPlans = ["starter", "business", "pro"];
const allowedStatuses = ["trial", "active", "expired", "suspended"];

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

const formatShop = (shop) => ({
  id: shop.id,
  shop_id: shop.id,
  shop_name: shop.shop_name,
  owner_name: shop.owner_name || null,
  owner_email: shop.owner_email || null,
  phone: shop.phone || null,
  subscription_plan: shop.subscription_plan || null,
  subscription_status: shop.subscription_status || null,
  subscription_start_date: shop.subscription_start_date || null,
  subscription_expiry_date: shop.subscription_expiry_date || null,
  monthly_fee: toNumber(shop.monthly_fee),
  is_enabled: Boolean(Number(shop.is_enabled ?? 1)),
  created_at: shop.created_at,
});

const getShopById = async (shopId) => {
  const [shops] = await db.promise().query(
    `SELECT
       shops.id,
       shops.shop_name,
       shops.phone,
       shops.address,
       shops.subscription_plan,
       shops.subscription_status,
       shops.subscription_start_date,
       shops.subscription_expiry_date,
       shops.monthly_fee,
       shops.is_enabled,
       shops.created_at,
       owners.id AS owner_id,
       owners.name AS owner_name,
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
    const [shops] = await db.promise().query(
      `SELECT
         shops.id,
         shops.shop_name,
         shops.phone,
         shops.subscription_plan,
         shops.subscription_status,
         shops.subscription_start_date,
         shops.subscription_expiry_date,
         shops.monthly_fee,
         shops.is_enabled,
         shops.created_at,
         owners.name AS owner_name,
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
        "SELECT COUNT(*) AS total_staff FROM users WHERE shop_id = ? AND role = 'staff'",
        [shopId]
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

exports.enableShop = async (req, res) => {
  const shopId = req.params.id;

  if (!isPositiveInteger(shopId)) {
    return res.status(400).json({ message: "Valid shop id is required" });
  }

  try {
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
