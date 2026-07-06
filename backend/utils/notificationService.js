const crypto = require("crypto");

const db = require("../config/db");
const { redactText, sanitizeForLogging } = require("./logSanitizer");
const {
  CHANNELS,
  ensureNotificationSchema,
} = require("./notificationSchema");
const inAppProvider = require("./notificationProviders/inAppProvider");
const emailProvider = require("./notificationProviders/emailProvider");
const smsProvider = require("./notificationProviders/smsProvider");
const whatsappProvider = require("./notificationProviders/whatsappProvider");

const providers = {
  in_app: inAppProvider,
  email: emailProvider,
  sms: smsProvider,
  whatsapp: whatsappProvider,
};

const safeText = (value, maxLength = 1000) =>
  redactText(value === undefined || value === null ? "" : String(value)).slice(
    0,
    maxLength
  );

const parseChannels = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.filter((channel) => CHANNELS.includes(channel)))];
  }

  try {
    return parseChannels(JSON.parse(value || "[]"));
  } catch {
    return [];
  }
};

const serializePayload = (value) =>
  JSON.stringify(sanitizeForLogging(value === undefined ? {} : value)).slice(
    0,
    30000
  );

const renderTemplate = (template, variables = {}) => {
  const render = (value) =>
    safeText(value, 10000).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) =>
      safeText(variables[key] ?? "", 1000)
    );

  return {
    title: render(template.title_template).slice(0, 255),
    message: render(template.message_template),
  };
};

const maskDestination = (destination, channel) => {
  const value = safeText(destination, 255);
  if (!value) return null;

  if (channel === "email") {
    const [local, domain] = value.split("@");
    if (!domain) return "[REDACTED]";
    return `${local.slice(0, 2)}***@${domain}`;
  }

  const visible = value.slice(-4);
  return `${"*".repeat(Math.max(4, value.length - 4))}${visible}`;
};

const makeDedupeKey = (base, recipientKey) => {
  if (!base) return null;
  const value = `${base}:${recipientKey}`;
  if (value.length <= 191) return value;
  return `notification:${crypto.createHash("sha256").update(value).digest("hex")}`;
};

const getPreferenceScope = (recipient) => {
  if (recipient.preferenceUserId) return `user:${recipient.preferenceUserId}`;
  if (recipient.shopId) return `shop:${recipient.shopId}`;
  if (recipient.audienceType === "admin") return "admin:global";
  return `audience:${recipient.audienceType}`;
};

const resolveShop = async (shopId) => {
  const [shops] = await db.promise().query(
    `SELECT id, shop_name, email, phone
     FROM shops
     WHERE id = ?
     LIMIT 1`,
    [shopId]
  );
  return shops[0] || null;
};

const resolveRecipients = async ({
  audienceType,
  shopId = null,
  recipients = null,
}) => {
  if (Array.isArray(recipients) && recipients.length > 0) {
    return recipients.map((recipient, index) => ({
      audienceType,
      shopId: recipient.shopId || shopId || null,
      recipientUserId: recipient.userId || null,
      preferenceUserId: recipient.userId || null,
      email: recipient.email || null,
      phone: recipient.phone || null,
      recipientKey: recipient.userId
        ? `user-${recipient.userId}`
        : `direct-${index}`,
    }));
  }

  if (audienceType === "admin") {
    const [admins] = await db.promise().query(
      `SELECT id, email
       FROM users
       WHERE role = 'admin' AND is_active = 1
       ORDER BY id ASC`
    );
    return admins.map((admin) => ({
      audienceType,
      shopId,
      recipientUserId: admin.id,
      preferenceUserId: admin.id,
      email: admin.email || null,
      phone: null,
      recipientKey: `admin-${admin.id}`,
    }));
  }

  if (!shopId) return [];

  const shop = await resolveShop(shopId);
  if (!shop) return [];

  const [owners] = await db.promise().query(
    `SELECT id, email
     FROM users
     WHERE shop_id = ? AND role = 'owner' AND is_active = 1
     ORDER BY id ASC`,
    [shopId]
  );
  const owner = owners[0] || null;

  if (audienceType === "shop") {
    return [
      {
        audienceType,
        shopId,
        recipientUserId: null,
        preferenceUserId: owner?.id || null,
        email: owner?.email || shop.email || null,
        phone: shop.phone || null,
        recipientKey: `shop-${shopId}`,
      },
    ];
  }

  if (owners.length === 0) {
    return [
      {
        audienceType: "shop_owner",
        shopId,
        recipientUserId: null,
        preferenceUserId: null,
        email: shop.email || null,
        phone: shop.phone || null,
        recipientKey: `shop-owner-${shopId}`,
      },
    ];
  }

  return owners.map((ownerUser) => ({
    audienceType: "shop_owner",
    shopId,
    recipientUserId: ownerUser.id,
    preferenceUserId: ownerUser.id,
    email: ownerUser.email || shop.email || null,
    phone: shop.phone || null,
    recipientKey: `owner-${ownerUser.id}`,
  }));
};

const getDestination = (recipient, channel, override) => {
  if (override) return override;
  if (channel === "email") return recipient.email;
  if (channel === "sms" || channel === "whatsapp") return recipient.phone;
  return null;
};

const getPreference = async ({ recipient, templateKey, channel }) => {
  const scope = getPreferenceScope(recipient);
  const [rows] = await db.promise().query(
    `SELECT is_enabled, destination
     FROM notification_preferences
     WHERE preference_scope = ? AND template_key = ? AND channel = ?
     LIMIT 1`,
    [scope, templateKey, channel]
  );

  return {
    enabled: rows.length === 0 || Boolean(Number(rows[0].is_enabled)),
    destination: rows[0]?.destination || null,
  };
};

const insertNotification = async ({
  recipient,
  templateKey,
  title,
  message,
  payload,
  link,
  priority,
  count,
  dedupeKey,
}) => {
  if (dedupeKey) {
    const [existing] = await db.promise().query(
      "SELECT id FROM notifications WHERE dedupe_key = ? LIMIT 1",
      [dedupeKey]
    );
    if (existing.length > 0) {
      return { id: existing[0].id, existing: true };
    }
  }

  try {
    const [result] = await db.promise().query(
      `INSERT INTO notifications
       (shop_id, recipient_user_id, audience_type, template_key, title, message,
        payload, link, priority, notification_count, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipient.shopId || null,
        recipient.recipientUserId || null,
        recipient.audienceType,
        templateKey,
        title,
        message,
        payload,
        link ? safeText(link, 500) : null,
        safeText(priority || "medium", 20),
        Math.max(1, Number(count) || 1),
        dedupeKey,
      ]
    );

    return { id: result.insertId, existing: false };
  } catch (error) {
    if (error.code !== "ER_DUP_ENTRY" || !dedupeKey) throw error;
    const [existing] = await db.promise().query(
      "SELECT id FROM notifications WHERE dedupe_key = ? LIMIT 1",
      [dedupeKey]
    );
    if (existing.length === 0) throw error;
    return { id: existing[0].id, existing: true };
  }
};

const insertDeliveryLog = async ({
  notificationId,
  recipient,
  templateKey,
  channel,
  destination,
  provider,
  status,
  payload,
  error,
}) => {
  const [result] = await db.promise().query(
    `INSERT INTO notification_delivery_logs
     (notification_id, shop_id, recipient_user_id, template_key, channel,
      destination, provider, status, payload, error_message, attempted_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [
      notificationId || null,
      recipient.shopId || null,
      recipient.recipientUserId || null,
      templateKey,
      channel,
      maskDestination(destination, channel),
      safeText(provider || `${channel}_provider`, 100),
      status,
      payload,
      error ? safeText(error, 2000) : null,
      status === "sent" ? new Date() : null,
    ]
  );
  return result.insertId;
};

const dispatchNotification = async ({
  templateKey,
  audienceType,
  shopId = null,
  recipients = null,
  variables = {},
  payload = {},
  channels = null,
  link = null,
  priority = null,
  count = 1,
  dedupeKey = null,
}) => {
  try {
    await ensureNotificationSchema();
    const [templates] = await db.promise().query(
      `SELECT *
       FROM notification_templates
       WHERE template_key = ? AND is_active = 1
       LIMIT 1`,
      [templateKey]
    );
    const template = templates[0];

    if (!template) {
      return { ok: false, error: "Notification template not found", deliveries: [] };
    }

    const selectedChannels = parseChannels(
      channels?.length ? channels : template.default_channels
    );
    const orderedChannels = [
      ...selectedChannels.filter((channel) => channel === "in_app"),
      ...selectedChannels.filter((channel) => channel !== "in_app"),
    ];
    const resolvedRecipients = await resolveRecipients({
      audienceType,
      shopId,
      recipients,
    });
    const rendered = renderTemplate(template, variables);
    const safePayload = serializePayload({
      template_key: templateKey,
      variables,
      data: payload,
    });
    const deliveries = [];

    for (const recipient of resolvedRecipients) {
      const recipientDedupeKey = makeDedupeKey(
        dedupeKey,
        recipient.recipientKey
      );

      if (recipientDedupeKey) {
        const [existing] = await db.promise().query(
          "SELECT id FROM notifications WHERE dedupe_key = ? LIMIT 1",
          [recipientDedupeKey]
        );
        if (existing.length > 0) {
          deliveries.push({
            notification_id: existing[0].id,
            status: "deduplicated",
          });
          continue;
        }
      }

      let notificationId = null;

      for (const channel of orderedChannels) {
        const preference = await getPreference({
          recipient,
          templateKey,
          channel,
        });
        const destination = getDestination(
          recipient,
          channel,
          preference.destination
        );

        if (!preference.enabled) {
          const logId = await insertDeliveryLog({
            notificationId,
            recipient,
            templateKey,
            channel,
            destination,
            provider: `${channel}_preference`,
            status: "skipped",
            payload: safePayload,
            error: "Channel disabled by notification preference",
          });
          deliveries.push({ id: logId, channel, status: "skipped" });
          continue;
        }

        let result;
        try {
          result = await providers[channel].send({
            destination,
            title: rendered.title,
            message: rendered.message,
            payload: safePayload,
          });
        } catch (error) {
          result = {
            status: "failed",
            provider: `${channel}_provider`,
            error: error.message,
          };
        }

        if (channel === "in_app" && result.status === "sent") {
          const created = await insertNotification({
            recipient,
            templateKey,
            title: rendered.title,
            message: rendered.message,
            payload: safePayload,
            link,
            priority: priority || template.default_priority,
            count,
            dedupeKey: recipientDedupeKey,
          });
          notificationId = created.id;
        }

        const status = ["sent", "failed", "skipped"].includes(result.status)
          ? result.status
          : "failed";
        const logId = await insertDeliveryLog({
          notificationId,
          recipient,
          templateKey,
          channel,
          destination,
          provider: result.provider,
          status,
          payload: safePayload,
          error: result.error,
        });
        deliveries.push({
          id: logId,
          notification_id: notificationId,
          channel,
          status,
        });
      }
    }

    return { ok: true, deliveries };
  } catch (error) {
    console.error("Notification delivery failed:", safeText(error.message, 1000));
    return { ok: false, error: safeText(error.message, 1000), deliveries: [] };
  }
};

const getPreferencesForUser = async (user) => {
  await ensureNotificationSchema();
  const scope = `user:${user.id}`;
  const [templates] = await db.promise().query(
    `SELECT template_key, name, default_channels
     FROM notification_templates
     WHERE is_active = 1
     ORDER BY name ASC`
  );
  const [preferenceRows] = await db.promise().query(
    `SELECT template_key, channel, is_enabled, destination
     FROM notification_preferences
     WHERE preference_scope = ?`,
    [scope]
  );
  const preferenceMap = new Map(
    preferenceRows.map((row) => [
      `${row.template_key}:${row.channel}`,
      row,
    ])
  );

  return templates.map((template) => ({
    template_key: template.template_key,
    name: template.name,
    channels: CHANNELS.map((channel) => {
      const preference = preferenceMap.get(
        `${template.template_key}:${channel}`
      );
      const defaultEnabled = parseChannels(template.default_channels).includes(channel);
      return {
        channel,
        enabled:
          preference === undefined
            ? defaultEnabled
            : Boolean(Number(preference.is_enabled)),
        destination: preference?.destination || null,
      };
    }),
  }));
};

const updatePreferencesForUser = async (user, preferences) => {
  await ensureNotificationSchema();
  const scope = `user:${user.id}`;
  const audienceType = user.role === "admin" ? "admin" : "shop_owner";
  const [templates] = await db.promise().query(
    "SELECT template_key FROM notification_templates WHERE is_active = 1"
  );
  const allowedTemplates = new Set(templates.map((template) => template.template_key));

  for (const preference of preferences) {
    if (
      !allowedTemplates.has(preference.template_key) ||
      !CHANNELS.includes(preference.channel) ||
      typeof preference.enabled !== "boolean"
    ) {
      const error = new Error("Invalid notification preference");
      error.statusCode = 400;
      throw error;
    }

    await db.promise().query(
      `INSERT INTO notification_preferences
       (shop_id, user_id, audience_type, preference_scope, template_key,
        channel, is_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_enabled = VALUES(is_enabled),
         updated_at = NOW()`,
      [
        user.shop_id || null,
        user.id,
        audienceType,
        scope,
        preference.template_key,
        preference.channel,
        preference.enabled ? 1 : 0,
      ]
    );
  }

  return getPreferencesForUser(user);
};

const sendCreditDueReminder = async ({
  shopId,
  customerId,
  amount,
  dueDate = "",
}) => {
  await ensureNotificationSchema();
  const [[customers], shop] = await Promise.all([
    db.promise().query(
      `SELECT id, phone
       FROM customers
       WHERE id = ? AND shop_id = ?
       LIMIT 1`,
      [customerId, shopId]
    ),
    resolveShop(shopId),
  ]);
  const customer = customers[0];
  if (!customer || !shop) return { ok: false, deliveries: [] };

  return dispatchNotification({
    templateKey: "credit_due_reminder",
    audienceType: "customer",
    shopId,
    recipients: [
      {
        shopId,
        phone: customer.phone,
      },
    ],
    variables: {
      amount,
      due_date: dueDate,
      shop_name: shop.shop_name,
    },
    payload: {
      customer_id: customerId,
      amount,
      due_date: dueDate,
    },
  });
};

module.exports = {
  CHANNELS,
  dispatchNotification,
  getPreferencesForUser,
  sendCreditDueReminder,
  updatePreferencesForUser,
};
