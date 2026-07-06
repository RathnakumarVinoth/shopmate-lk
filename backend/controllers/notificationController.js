const db = require("../config/db");
const { ensurePaymentVerificationTable } = require("../utils/paymentSchema");
const { ensureNotificationSchema } = require("../utils/notificationSchema");
const {
  CHANNELS,
  dispatchNotification,
  getPreferencesForUser,
  updatePreferencesForUser,
} = require("../utils/notificationService");
const { ensureReturnTables } = require("./returnController");

const toNumber = (value) => Number(value || 0);
const positiveInteger = (value, fallback, maximum = 100) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
};
const dayKey = () => new Date().toISOString().slice(0, 10);

const buildSummary = ({
  type,
  title,
  message,
  priority,
  count,
  link,
}) => ({
  id: `summary:${type}`,
  type,
  template_key: type,
  title,
  message,
  priority,
  count,
  link,
  status: "unread",
  persisted: false,
  created_at: new Date().toISOString(),
});

const getPriority = (count, highAt = 10) => {
  if (count >= highAt) return "high";
  if (count > 0) return "medium";
  return "low";
};

const syncAdminNotifications = async () => {
  const [rows] = await db.promise().query(
    `SELECT COUNT(*) AS expiring_count
     FROM shops
     WHERE subscription_expiry_date IS NOT NULL
       AND DATEDIFF(subscription_expiry_date, CURDATE()) BETWEEN 0 AND 7`
  );
  const count = toNumber(rows[0]?.expiring_count);
  if (count === 0) return;

  await dispatchNotification({
    templateKey: "subscription_expiry",
    audienceType: "admin",
    variables: {
      message: `${count} shop subscription(s) expire within 7 days.`,
    },
    payload: { expiring_shop_count: count },
    link: "/admin/shops",
    count,
    dedupeKey: `admin-subscription-expiry:${dayKey()}`,
  });
};

const syncShopNotifications = async (shopId) => {
  const [[stockRows], [expiredRows], [shopRows]] = await Promise.all([
    db.promise().query(
      `SELECT COUNT(*) AS alert_count
       FROM products
       INNER JOIN shops ON shops.id = products.shop_id
       WHERE products.shop_id = ?
         AND products.stock_quantity <=
           COALESCE(products.low_stock_limit, shops.default_low_stock_limit, 5)`,
      [shopId]
    ),
    db.promise().query(
      `SELECT COUNT(*) AS alert_count
       FROM stock_batches
       WHERE shop_id = ?
         AND quantity_remaining > 0
         AND expiry_date IS NOT NULL
         AND expiry_date < CURDATE()`,
      [shopId]
    ),
    db.promise().query(
      `SELECT shop_name, subscription_expiry_date,
              DATEDIFF(subscription_expiry_date, CURDATE()) AS days_remaining
       FROM shops
       WHERE id = ?
       LIMIT 1`,
      [shopId]
    ),
  ]);
  const shop = shopRows[0] || {};
  const lowStockCount = toNumber(stockRows[0]?.alert_count);
  const expiredStockCount = toNumber(expiredRows[0]?.alert_count);
  const daysRemaining = shop.days_remaining;

  if (lowStockCount > 0) {
    await dispatchNotification({
      templateKey: "low_stock",
      audienceType: "shop",
      shopId,
      variables: { count: lowStockCount, shop_name: shop.shop_name },
      payload: { low_stock_count: lowStockCount },
      link: "/products",
      count: lowStockCount,
      priority: getPriority(lowStockCount),
      dedupeKey: `low-stock:${shopId}:${dayKey()}`,
    });
  }

  if (expiredStockCount > 0) {
    await dispatchNotification({
      templateKey: "expired_stock",
      audienceType: "shop",
      shopId,
      variables: { count: expiredStockCount, shop_name: shop.shop_name },
      payload: { expired_batch_count: expiredStockCount },
      link: "/stock",
      count: expiredStockCount,
      dedupeKey: `expired-stock:${shopId}:${dayKey()}`,
    });
  }

  if (
    daysRemaining !== null &&
    daysRemaining !== undefined &&
    daysRemaining >= 0 &&
    daysRemaining <= 7
  ) {
    await dispatchNotification({
      templateKey: "subscription_expiry",
      audienceType: "shop_owner",
      shopId,
      variables: {
        shop_name: shop.shop_name,
        message: `Your shop subscription expires in ${daysRemaining} day(s).`,
      },
      payload: { days_remaining: Number(daysRemaining) },
      link: "/settings",
      dedupeKey: `shop-subscription-expiry:${shopId}:${dayKey()}`,
    });
  }
};

const getNotificationAccess = (user) => {
  if (user.role === "admin") {
    return {
      where: `audience_type = 'admin'
              AND (recipient_user_id IS NULL OR recipient_user_id = ?)`,
      values: [user.id],
    };
  }

  if (user.role === "owner") {
    return {
      where: `shop_id = ?
              AND (
                audience_type = 'shop'
                OR (
                  audience_type = 'shop_owner'
                  AND (recipient_user_id IS NULL OR recipient_user_id = ?)
                )
              )`,
      values: [user.shop_id, user.id],
    };
  }

  return {
    where: `shop_id = ?
            AND audience_type = 'shop'
            AND (recipient_user_id IS NULL OR recipient_user_id = ?)`,
    values: [user.shop_id, user.id],
  };
};

const getPersistedNotifications = async (user, page, limit) => {
  const access = getNotificationAccess(user);
  const offset = (page - 1) * limit;
  const [[countRows], [rows]] = await Promise.all([
    db.promise().query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS unread
       FROM notifications
       WHERE ${access.where}`,
      access.values
    ),
    db.promise().query(
      `SELECT id, template_key AS type, template_key, title, message, link,
              priority, notification_count AS count, status, read_at, created_at
       FROM notifications
       WHERE ${access.where}
       ORDER BY status = 'unread' DESC, created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...access.values, limit, offset]
    ),
  ]);
  const total = toNumber(countRows[0]?.total);

  return {
    notifications: rows.map((row) => ({ ...row, persisted: true })),
    unread: toNumber(countRows[0]?.unread),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getLiveSummaries = async (user) => {
  if (user.role === "admin") return [];

  await ensurePaymentVerificationTable();
  const [pendingRows] = await db.promise().query(
    `SELECT COUNT(*) AS alert_count
     FROM payment_verifications
     WHERE shop_id = ? AND status = 'pending'`,
    [user.shop_id]
  );
  const pendingCount = toNumber(pendingRows[0]?.alert_count);
  const summaries = [];

  if (pendingCount > 0) {
    summaries.push(
      buildSummary({
        type: "pending_payments",
        title: "Pending payment verification",
        message: `${pendingCount} payment(s) need verification.`,
        priority: getPriority(pendingCount, 5),
        count: pendingCount,
        link: "/payment-verification",
      })
    );
  }

  if (user.role !== "owner") return summaries;

  await ensureReturnTables();
  const [[creditRows], [supplierRows], [returnRows]] = await Promise.all([
    db.promise().query(
      `SELECT COUNT(*) AS alert_count
       FROM credit_records
       WHERE shop_id = ?
         AND (status IN ('unpaid', 'partial') OR balance_amount > 0)`,
      [user.shop_id]
    ),
    db.promise().query(
      `SELECT COUNT(*) AS alert_count
       FROM supplier_transactions
       WHERE shop_id = ?
         AND (status IN ('unpaid', 'partial') OR balance_amount > 0)`,
      [user.shop_id]
    ),
    db.promise().query(
      `SELECT COUNT(*) AS alert_count
       FROM sales_returns
       WHERE shop_id = ? AND DATE(created_at) = CURDATE()`,
      [user.shop_id]
    ),
  ]);

  const definitions = [
    {
      type: "unpaid_credits",
      count: toNumber(creditRows[0]?.alert_count),
      title: "Unpaid customer credits",
      message: "credit record(s) have an unpaid balance.",
      link: "/credit-book",
    },
    {
      type: "supplier_due",
      count: toNumber(supplierRows[0]?.alert_count),
      title: "Supplier balances due",
      message: "supplier transaction(s) have an unpaid balance.",
      link: "/suppliers",
    },
    {
      type: "recent_returns",
      count: toNumber(returnRows[0]?.alert_count),
      title: "Returns processed today",
      message: "return(s) were processed today.",
      link: "/returns",
    },
  ];

  for (const definition of definitions) {
    if (definition.count > 0) {
      summaries.push(
        buildSummary({
          ...definition,
          message: `${definition.count} ${definition.message}`,
          priority: getPriority(definition.count),
        })
      );
    }
  }

  return summaries;
};

exports.getNotifications = async (req, res, next) => {
  try {
    await ensureNotificationSchema();

    if (req.user.role === "admin") {
      await syncAdminNotifications();
    } else {
      await syncShopNotifications(req.user.shop_id);
    }

    const page = positiveInteger(req.query.page, 1, 100000);
    const limit = positiveInteger(req.query.limit, 20, 100);
    const [persisted, summaries] = await Promise.all([
      getPersistedNotifications(req.user, page, limit),
      getLiveSummaries(req.user),
    ]);

    return res.json({
      message: "Notifications fetched successfully",
      notifications: [...persisted.notifications, ...summaries],
      unread_count: persisted.unread + summaries.length,
      pagination: persisted.pagination,
    });
  } catch (error) {
    return next(error);
  }
};

exports.markNotificationRead = async (req, res, next) => {
  const notificationId = Number(req.params.id);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ message: "Valid notification id is required" });
  }

  try {
    await ensureNotificationSchema();
    const access = getNotificationAccess(req.user);
    const [rows] = await db.promise().query(
      `SELECT id
       FROM notifications
       WHERE id = ? AND ${access.where}
       LIMIT 1`,
      [notificationId, ...access.values]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await db.promise().query(
      `UPDATE notifications
       SET status = 'read', read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND ${access.where}`,
      [notificationId, ...access.values]
    );

    return res.json({ message: "Notification marked as read" });
  } catch (error) {
    return next(error);
  }
};

exports.getNotificationPreferences = async (req, res, next) => {
  try {
    const preferences = await getPreferencesForUser(req.user);
    return res.json({
      message: "Notification preferences fetched successfully",
      preferences,
      channels: CHANNELS,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateNotificationPreferences = async (req, res, next) => {
  if (
    !Array.isArray(req.body.preferences) ||
    req.body.preferences.length === 0 ||
    req.body.preferences.length > 100
  ) {
    return res.status(400).json({ message: "preferences array is required" });
  }

  try {
    const preferences = await updatePreferencesForUser(
      req.user,
      req.body.preferences
    );
    return res.json({
      message: "Notification preferences updated successfully",
      preferences,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

exports.getAdminNotificationLogs = async (req, res, next) => {
  const page = positiveInteger(req.query.page, 1, 100000);
  const limit = positiveInteger(req.query.limit, 20, 100);
  const offset = (page - 1) * limit;
  const clauses = [];
  const values = [];

  if (req.query.status) {
    clauses.push("notification_delivery_logs.status = ?");
    values.push(String(req.query.status).slice(0, 20));
  }
  if (req.query.channel) {
    clauses.push("notification_delivery_logs.channel = ?");
    values.push(String(req.query.channel).slice(0, 20));
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    await ensureNotificationSchema();
    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(
        `SELECT COUNT(*) AS total
         FROM notification_delivery_logs
         ${where}`,
        values
      ),
      db.promise().query(
        `SELECT notification_delivery_logs.id,
                notification_delivery_logs.notification_id,
                notification_delivery_logs.shop_id,
                notification_delivery_logs.recipient_user_id,
                notification_delivery_logs.template_key,
                notification_delivery_logs.channel,
                notification_delivery_logs.destination,
                notification_delivery_logs.provider,
                notification_delivery_logs.status,
                notification_delivery_logs.error_message,
                notification_delivery_logs.attempt_count,
                notification_delivery_logs.attempted_at,
                notification_delivery_logs.sent_at,
                notification_delivery_logs.created_at,
                shops.shop_name,
                users.name AS recipient_name
         FROM notification_delivery_logs
         LEFT JOIN shops ON shops.id = notification_delivery_logs.shop_id
         LEFT JOIN users ON users.id =
           notification_delivery_logs.recipient_user_id
         ${where}
         ORDER BY notification_delivery_logs.created_at DESC,
                  notification_delivery_logs.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      ),
    ]);
    const total = toNumber(countRows[0]?.total);

    return res.json({
      message: "Notification delivery logs fetched successfully",
      logs: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.sendAdminTestNotification = async (req, res, next) => {
  const channels =
    req.body.channels === undefined ? ["in_app"] : req.body.channels;

  if (
    !Array.isArray(channels) ||
    channels.length === 0 ||
    channels.some((channel) => !CHANNELS.includes(channel))
  ) {
    return res.status(400).json({ message: "Valid notification channels are required" });
  }

  try {
    const suppliedVariables =
      req.body.variables &&
      typeof req.body.variables === "object" &&
      !Array.isArray(req.body.variables)
        ? req.body.variables
        : {};
    const result = await dispatchNotification({
      templateKey: "test_notification",
      audienceType: "admin",
      recipients: [
        {
          userId: req.user.id,
          email: req.user.email,
        },
      ],
      variables: {
        requested_by: req.user.name || "admin",
        ...suppliedVariables,
      },
      payload: {
        requested_by_user_id: req.user.id,
        test_data: suppliedVariables,
      },
      channels,
    });

    if (!result.ok) {
      return res.status(500).json({ message: "Test notification could not be queued" });
    }

    return res.status(201).json({
      message: "Test notification processed",
      deliveries: result.deliveries,
    });
  } catch (error) {
    return next(error);
  }
};
