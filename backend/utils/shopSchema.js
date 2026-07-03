const db = require("../config/db");

let ensuredShopSettingsColumns = false;

const ensureShopSettingsColumns = async () => {
  if (ensuredShopSettingsColumns) return;

  const [columns] = await db.promise().query("SHOW COLUMNS FROM shops");
  const existingColumns = new Set(columns.map((column) => column.Field));

  if (!existingColumns.has("default_receipt_size")) {
    await db
      .promise()
      .query("ALTER TABLE shops ADD COLUMN default_receipt_size VARCHAR(10) DEFAULT '80mm'");
  }

  if (!existingColumns.has("language")) {
    await db
      .promise()
      .query("ALTER TABLE shops ADD COLUMN language VARCHAR(10) DEFAULT 'en'");
  }

  if (!existingColumns.has("idle_timeout_minutes")) {
    await db
      .promise()
      .query(
        "ALTER TABLE shops ADD COLUMN idle_timeout_minutes INT NOT NULL DEFAULT 15"
      );
  }

  if (!existingColumns.has("background_logout_minutes")) {
    await db
      .promise()
      .query(
        "ALTER TABLE shops ADD COLUMN background_logout_minutes INT NOT NULL DEFAULT 3"
      );
  }

  ensuredShopSettingsColumns = true;
};

module.exports = { ensureShopSettingsColumns };
