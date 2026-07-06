const db = require("../config/db");

const CHANNELS = ["in_app", "email", "sms", "whatsapp"];
const TEMPLATE_DEFINITIONS = [
  {
    key: "backup_success",
    name: "Backup success",
    title: "Backup completed",
    message: "The backup for {{shop_name}} completed successfully.",
    priority: "low",
  },
  {
    key: "backup_failure",
    name: "Backup failure",
    title: "Backup failed",
    message: "The backup for {{shop_name}} failed. {{error}}",
    priority: "high",
  },
  {
    key: "restore_success",
    name: "Restore success",
    title: "Restore completed",
    message: "The backup for {{shop_name}} was restored successfully.",
    priority: "medium",
  },
  {
    key: "restore_failure",
    name: "Restore failure",
    title: "Restore failed",
    message: "The restore for {{shop_name}} failed. {{error}}",
    priority: "high",
  },
  {
    key: "low_stock",
    name: "Low stock alert",
    title: "Low stock items",
    message: "{{count}} product(s) are at or below the low stock limit.",
    priority: "medium",
  },
  {
    key: "expired_stock",
    name: "Expired stock alert",
    title: "Expired stock requires attention",
    message: "{{count}} batch(es) with remaining stock have expired.",
    priority: "high",
  },
  {
    key: "credit_due_reminder",
    name: "Credit due reminder",
    title: "Credit payment reminder",
    message: "A balance of {{amount}} is due to {{shop_name}}. {{due_date}}",
    priority: "medium",
    channels: ["sms", "whatsapp", "email"],
  },
  {
    key: "system_error",
    name: "System error alert",
    title: "System alert",
    message: "{{message}}",
    priority: "high",
  },
  {
    key: "subscription_expiry",
    name: "Subscription expiry reminder",
    title: "Subscription expiring soon",
    message: "{{message}}",
    priority: "high",
  },
  {
    key: "test_notification",
    name: "Test notification",
    title: "ShopMate notification test",
    message: "Notification delivery test requested by {{requested_by}}.",
    priority: "low",
  },
];

let notificationSchemaReady = false;
let notificationSchemaPromise = null;

const addColumnIfMissing = async (connection, table, columns, name, definition) => {
  if (columns.has(name)) return;
  await connection.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  columns.add(name);
};

const addIndexIfMissing = async (connection, table, indexName, definition, unique = false) => {
  const [indexes] = await connection.query(
    `SHOW INDEX FROM ${table} WHERE Key_name = ?`,
    [indexName]
  );

  if (indexes.length === 0) {
    await connection.query(
      `ALTER TABLE ${table} ADD ${unique ? "UNIQUE " : ""}INDEX ${indexName} ${definition}`
    );
  }
};

const prepareNotificationSchema = async () => {
  if (notificationSchemaReady) return;

  const connection = db.promise();

  await connection.query(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      template_key VARCHAR(100) NOT NULL,
      name VARCHAR(150) NOT NULL,
      title_template VARCHAR(255) NOT NULL,
      message_template TEXT NOT NULL,
      default_channels TEXT NOT NULL,
      default_priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_notification_template_key (template_key),
      INDEX idx_notification_templates_active (is_active)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NULL,
      user_id INT NULL,
      audience_type VARCHAR(30) NOT NULL,
      preference_scope VARCHAR(191) NOT NULL,
      template_key VARCHAR(100) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      destination VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_notification_preference
        (preference_scope, template_key, channel),
      INDEX idx_notification_preferences_shop (shop_id, user_id),
      INDEX idx_notification_preferences_template (template_key, channel)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NULL,
      recipient_user_id INT NULL,
      audience_type VARCHAR(30) NOT NULL,
      template_key VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      payload LONGTEXT NULL,
      link VARCHAR(500) NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      notification_count INT NOT NULL DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'unread',
      read_at DATETIME NULL,
      dedupe_key VARCHAR(191) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_notification_dedupe (dedupe_key),
      INDEX idx_notifications_shop_status (shop_id, status, created_at),
      INDEX idx_notifications_recipient_status
        (recipient_user_id, status, created_at),
      INDEX idx_notifications_audience_created (audience_type, created_at)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS notification_delivery_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      notification_id BIGINT NULL,
      shop_id INT NULL,
      recipient_user_id INT NULL,
      template_key VARCHAR(100) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      destination VARCHAR(255) NULL,
      provider VARCHAR(100) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      payload LONGTEXT NULL,
      error_message TEXT NULL,
      attempt_count INT NOT NULL DEFAULT 1,
      attempted_at DATETIME NULL,
      sent_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_notification_logs_status_created (status, created_at),
      INDEX idx_notification_logs_shop_created (shop_id, created_at),
      INDEX idx_notification_logs_template_channel (template_key, channel),
      INDEX idx_notification_logs_notification (notification_id)
    )
  `);

  const tableDefinitions = {
    notification_templates: [
      ["template_key", "template_key VARCHAR(100) NOT NULL"],
      ["name", "name VARCHAR(150) NOT NULL DEFAULT 'Notification'"],
      ["title_template", "title_template VARCHAR(255) NOT NULL DEFAULT 'Notification'"],
      ["message_template", "message_template TEXT NULL"],
      ["default_channels", "default_channels TEXT NULL"],
      ["default_priority", "default_priority VARCHAR(20) NOT NULL DEFAULT 'medium'"],
      ["is_active", "is_active TINYINT(1) NOT NULL DEFAULT 1"],
      ["created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
    ],
    notification_preferences: [
      ["shop_id", "shop_id INT NULL"],
      ["user_id", "user_id INT NULL"],
      ["audience_type", "audience_type VARCHAR(30) NOT NULL DEFAULT 'shop_owner'"],
      ["preference_scope", "preference_scope VARCHAR(191) NOT NULL DEFAULT 'legacy'"],
      ["template_key", "template_key VARCHAR(100) NOT NULL DEFAULT 'system_error'"],
      ["channel", "channel VARCHAR(20) NOT NULL DEFAULT 'in_app'"],
      ["is_enabled", "is_enabled TINYINT(1) NOT NULL DEFAULT 1"],
      ["destination", "destination VARCHAR(255) NULL"],
      ["created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
    ],
    notifications: [
      ["shop_id", "shop_id INT NULL"],
      ["recipient_user_id", "recipient_user_id INT NULL"],
      ["audience_type", "audience_type VARCHAR(30) NOT NULL DEFAULT 'shop_owner'"],
      ["template_key", "template_key VARCHAR(100) NOT NULL DEFAULT 'system_error'"],
      ["title", "title VARCHAR(255) NOT NULL DEFAULT 'Notification'"],
      ["message", "message TEXT NULL"],
      ["payload", "payload LONGTEXT NULL"],
      ["link", "link VARCHAR(500) NULL"],
      ["priority", "priority VARCHAR(20) NOT NULL DEFAULT 'medium'"],
      ["notification_count", "notification_count INT NOT NULL DEFAULT 1"],
      ["status", "status VARCHAR(20) NOT NULL DEFAULT 'unread'"],
      ["read_at", "read_at DATETIME NULL"],
      ["dedupe_key", "dedupe_key VARCHAR(191) NULL"],
      ["created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
    ],
    notification_delivery_logs: [
      ["notification_id", "notification_id BIGINT NULL"],
      ["shop_id", "shop_id INT NULL"],
      ["recipient_user_id", "recipient_user_id INT NULL"],
      ["template_key", "template_key VARCHAR(100) NOT NULL DEFAULT 'system_error'"],
      ["channel", "channel VARCHAR(20) NOT NULL DEFAULT 'in_app'"],
      ["destination", "destination VARCHAR(255) NULL"],
      ["provider", "provider VARCHAR(100) NULL"],
      ["status", "status VARCHAR(20) NOT NULL DEFAULT 'pending'"],
      ["payload", "payload LONGTEXT NULL"],
      ["error_message", "error_message TEXT NULL"],
      ["attempt_count", "attempt_count INT NOT NULL DEFAULT 1"],
      ["attempted_at", "attempted_at DATETIME NULL"],
      ["sent_at", "sent_at DATETIME NULL"],
      ["created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"],
      ["updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
    ],
  };

  for (const [table, definitions] of Object.entries(tableDefinitions)) {
    const [columns] = await connection.query(`SHOW COLUMNS FROM ${table}`);
    const existingColumns = new Set(columns.map((column) => column.Field));

    for (const [name, definition] of definitions) {
      await addColumnIfMissing(connection, table, existingColumns, name, definition);
    }
  }

  await addIndexIfMissing(
    connection,
    "notification_templates",
    "unique_notification_template_key",
    "(template_key)",
    true
  );
  await addIndexIfMissing(
    connection,
    "notification_preferences",
    "unique_notification_preference",
    "(preference_scope, template_key, channel)",
    true
  );
  await addIndexIfMissing(
    connection,
    "notification_preferences",
    "idx_notification_preferences_shop",
    "(shop_id, user_id)"
  );
  await addIndexIfMissing(
    connection,
    "notifications",
    "unique_notification_dedupe",
    "(dedupe_key)",
    true
  );
  await addIndexIfMissing(
    connection,
    "notifications",
    "idx_notifications_shop_status",
    "(shop_id, status, created_at)"
  );
  await addIndexIfMissing(
    connection,
    "notifications",
    "idx_notifications_recipient_status",
    "(recipient_user_id, status, created_at)"
  );
  await addIndexIfMissing(
    connection,
    "notification_delivery_logs",
    "idx_notification_logs_status_created",
    "(status, created_at)"
  );
  await addIndexIfMissing(
    connection,
    "notification_delivery_logs",
    "idx_notification_logs_shop_created",
    "(shop_id, created_at)"
  );

  for (const template of TEMPLATE_DEFINITIONS) {
    await connection.query(
      `INSERT IGNORE INTO notification_templates
       (template_key, name, title_template, message_template, default_channels,
        default_priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        template.key,
        template.name,
        template.title,
        template.message,
        JSON.stringify(template.channels || CHANNELS),
        template.priority,
      ]
    );
  }

  notificationSchemaReady = true;
};

const ensureNotificationSchema = async () => {
  if (notificationSchemaReady) return;

  if (!notificationSchemaPromise) {
    notificationSchemaPromise = prepareNotificationSchema();
  }

  try {
    await notificationSchemaPromise;
  } finally {
    if (!notificationSchemaReady) {
      notificationSchemaPromise = null;
    }
  }
};

module.exports = {
  CHANNELS,
  TEMPLATE_DEFINITIONS,
  ensureNotificationSchema,
};
