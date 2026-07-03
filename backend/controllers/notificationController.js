const db = require("../config/db");
const { ensurePaymentVerificationTable } = require("../utils/paymentSchema");
const { ensureReturnTables } = require("./returnController");

const toNumber = (value) => Number(value || 0);

const getNow = () => new Date().toISOString();

const buildNotification = ({
  type,
  title,
  message,
  priority,
  count,
  link,
  created_at = getNow(),
}) => ({
  id: type,
  type,
  title,
  message,
  priority,
  count,
  link,
  created_at,
});

const getPriority = (count, highAt = 10) => {
  if (count >= highAt) return "high";
  if (count > 0) return "medium";
  return "low";
};

const getAdminNotifications = async () => {
  const [rows] = await db.promise().query(
    `SELECT COUNT(*) AS expiring_count
     FROM shops
     WHERE subscription_expiry_date IS NOT NULL
       AND DATEDIFF(subscription_expiry_date, CURDATE()) BETWEEN 0 AND 7`
  );

  const expiringCount = toNumber(rows[0]?.expiring_count);

  if (expiringCount === 0) {
    return [];
  }

  return [
    buildNotification({
      type: "subscription_expiry",
      title: "Subscriptions expiring soon",
      message: `${expiringCount} shop subscription${expiringCount === 1 ? " is" : "s are"} expiring within 7 days.`,
      priority: "high",
      count: expiringCount,
      link: "/admin/shops",
    }),
  ];
};

exports.getNotifications = async (req, res) => {
  const userRole = req.user.role;

  try {
    if (userRole === "admin") {
      const notifications = await getAdminNotifications();
      return res.json({ message: "Notifications fetched successfully", notifications });
    }

    const shopId = req.user.shop_id;

    await ensurePaymentVerificationTable();

    const [[lowStockRows], [pendingPaymentRows]] = await Promise.all([
      db.promise().query(
        `SELECT COUNT(*) AS alert_count
         FROM products
         INNER JOIN shops ON shops.id = products.shop_id
         WHERE products.shop_id = ?
           AND products.stock_quantity <= COALESCE(products.low_stock_limit, shops.default_low_stock_limit, 5)`,
        [shopId]
      ),
      db.promise().query(
        `SELECT COUNT(*) AS alert_count
         FROM payment_verifications
         WHERE shop_id = ? AND status = 'pending'`,
        [shopId]
      ),
    ]);

    const lowStockCount = toNumber(lowStockRows[0]?.alert_count);
    const pendingPaymentsCount = toNumber(pendingPaymentRows[0]?.alert_count);
    const notifications = [];

    if (lowStockCount > 0) {
      notifications.push(
        buildNotification({
          type: "low_stock",
          title: "Low stock items",
          message: `${lowStockCount} product${lowStockCount === 1 ? " is" : "s are"} at or below the low stock limit.`,
          priority: getPriority(lowStockCount),
          count: lowStockCount,
          link: "/products",
        })
      );
    }

    if (pendingPaymentsCount > 0) {
      notifications.push(
        buildNotification({
          type: "pending_payments",
          title: "Pending payment verification",
          message: `${pendingPaymentsCount} payment${pendingPaymentsCount === 1 ? " needs" : "s need"} verification.`,
          priority: getPriority(pendingPaymentsCount, 5),
          count: pendingPaymentsCount,
          link: "/payment-verification",
        })
      );
    }

    if (userRole !== "owner") {
      return res.json({ message: "Notifications fetched successfully", notifications });
    }

    await ensureReturnTables();

    const [
      [creditRows],
      [supplierRows],
      [shopRows],
      [returnRows],
    ] = await Promise.all([
      db.promise().query(
        `SELECT COUNT(*) AS alert_count
         FROM credit_records
         WHERE shop_id = ?
           AND (status IN ('unpaid', 'partial') OR balance_amount > 0)`,
        [shopId]
      ),
      db.promise().query(
        `SELECT COUNT(*) AS alert_count
         FROM supplier_transactions
         WHERE shop_id = ?
           AND (status IN ('unpaid', 'partial') OR balance_amount > 0)`,
        [shopId]
      ),
      db.promise().query(
        `SELECT subscription_expiry_date,
                DATEDIFF(subscription_expiry_date, CURDATE()) AS days_remaining
         FROM shops
         WHERE id = ?
         LIMIT 1`,
        [shopId]
      ),
      db.promise().query(
        `SELECT COUNT(*) AS alert_count
         FROM sales_returns
         WHERE shop_id = ? AND DATE(created_at) = CURDATE()`,
        [shopId]
      ),
    ]);

    const unpaidCreditsCount = toNumber(creditRows[0]?.alert_count);
    const supplierDueCount = toNumber(supplierRows[0]?.alert_count);
    const recentReturnsCount = toNumber(returnRows[0]?.alert_count);
    const daysRemaining = shopRows[0]?.days_remaining;

    if (unpaidCreditsCount > 0) {
      notifications.push(
        buildNotification({
          type: "unpaid_credits",
          title: "Unpaid customer credits",
          message: `${unpaidCreditsCount} credit record${unpaidCreditsCount === 1 ? " has" : "s have"} an unpaid balance.`,
          priority: getPriority(unpaidCreditsCount, 10),
          count: unpaidCreditsCount,
          link: "/credit-book",
        })
      );
    }

    if (supplierDueCount > 0) {
      notifications.push(
        buildNotification({
          type: "supplier_due",
          title: "Supplier balances due",
          message: `${supplierDueCount} supplier transaction${supplierDueCount === 1 ? " has" : "s have"} an unpaid balance.`,
          priority: getPriority(supplierDueCount, 10),
          count: supplierDueCount,
          link: "/suppliers",
        })
      );
    }

    if (daysRemaining !== null && daysRemaining !== undefined && daysRemaining >= 0 && daysRemaining <= 7) {
      notifications.push(
        buildNotification({
          type: "subscription_expiry",
          title: "Subscription expiring soon",
          message: `Your shop subscription expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
          priority: "high",
          count: 1,
          link: "/settings",
        })
      );
    }

    if (recentReturnsCount > 0) {
      notifications.push(
        buildNotification({
          type: "recent_returns",
          title: "Returns processed today",
          message: `${recentReturnsCount} return${recentReturnsCount === 1 ? " was" : "s were"} processed today.`,
          priority: "medium",
          count: recentReturnsCount,
          link: "/returns",
        })
      );
    }

    return res.json({ message: "Notifications fetched successfully", notifications });
  } catch (error) {
    console.error("Get notifications error:", error.message);
    return res.status(500).json({ message: "Server error while fetching notifications" });
  }
};
