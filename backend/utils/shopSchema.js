const db = require("../config/db");
const { serializeEnabledModules } = require("./shopModules");

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

  if (!existingColumns.has("receipt_footer")) {
    await db
      .promise()
      .query("ALTER TABLE shops ADD COLUMN receipt_footer VARCHAR(255) NULL");
  }

  if (!existingColumns.has("logo_url")) {
    await db
      .promise()
      .query("ALTER TABLE shops ADD COLUMN logo_url TEXT NULL");
  }

  const receiptFlags = [
    "receipt_show_logo",
    "receipt_show_tax",
    "receipt_show_discounts",
    "receipt_show_cashier",
  ];

  for (const flag of receiptFlags) {
    if (!existingColumns.has(flag)) {
      await db
        .promise()
        .query(
          `ALTER TABLE shops ADD COLUMN ${flag} TINYINT(1) NOT NULL DEFAULT 1`
        );
    }
  }

  if (!existingColumns.has("open_cash_drawer_after_print")) {
    await db
      .promise()
      .query(
        "ALTER TABLE shops ADD COLUMN open_cash_drawer_after_print TINYINT(1) NOT NULL DEFAULT 0"
      );
  }

  if (!existingColumns.has("shop_type")) {
    await db
      .promise()
      .query("ALTER TABLE shops ADD COLUMN shop_type VARCHAR(50) NOT NULL DEFAULT 'custom'");
  }

  if (!existingColumns.has("enabled_modules")) {
    await db
      .promise()
      .query("ALTER TABLE shops ADD COLUMN enabled_modules TEXT NULL");
  }

  if (!existingColumns.has("default_low_stock_limit")) {
    await db
      .promise()
      .query(
        "ALTER TABLE shops ADD COLUMN default_low_stock_limit INT NOT NULL DEFAULT 5"
      );
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

  await db.promise().query(
    `UPDATE shops
     SET shop_type = COALESCE(NULLIF(shop_type, ''), 'custom'),
         enabled_modules = COALESCE(NULLIF(enabled_modules, ''), ?)
     WHERE shop_type IS NULL
        OR shop_type = ''
        OR enabled_modules IS NULL
        OR enabled_modules = ''`,
    [serializeEnabledModules(undefined, "custom")]
  );

  ensuredShopSettingsColumns = true;
};

module.exports = { ensureShopSettingsColumns };
