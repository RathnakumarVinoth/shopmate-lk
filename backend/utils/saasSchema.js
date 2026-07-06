const db = require("../config/db");

let ensuredSaasSchema = false;

const addColumnIfMissing = async (connection, table, existingColumns, name, definition) => {
  if (!existingColumns.has(name)) {
    await connection.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    existingColumns.add(name);
  }
};

const ensureSaasSchema = async () => {
  if (ensuredSaasSchema) return;

  const connection = db.promise();

  const [shopColumns] = await connection.query("SHOW COLUMNS FROM shops");
  const existingShopColumns = new Set(shopColumns.map((column) => column.Field));

  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "login_email",
    "login_email VARCHAR(150) NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "login_password_hash",
    "login_password_hash VARCHAR(255) NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "shop_code",
    "shop_code VARCHAR(50) NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "owner_name",
    "owner_name VARCHAR(150) NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "is_enabled",
    "is_enabled TINYINT(1) NOT NULL DEFAULT 1"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "created_by_admin",
    "created_by_admin INT NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "subscription_plan",
    "subscription_plan VARCHAR(50) NOT NULL DEFAULT 'starter'"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "subscription_status",
    "subscription_status VARCHAR(50) NOT NULL DEFAULT 'trial'"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "subscription_start_date",
    "subscription_start_date DATE NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "subscription_expiry_date",
    "subscription_expiry_date DATE NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "monthly_fee",
    "monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "email",
    "email VARCHAR(150) NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "currency",
    "currency VARCHAR(10) NOT NULL DEFAULT 'LKR'"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "receipt_footer",
    "receipt_footer VARCHAR(255) NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "logo_url",
    "logo_url TEXT NULL"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "default_low_stock_limit",
    "default_low_stock_limit INT NOT NULL DEFAULT 5"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "default_receipt_size",
    "default_receipt_size VARCHAR(10) DEFAULT '80mm'"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "receipt_show_logo",
    "receipt_show_logo TINYINT(1) NOT NULL DEFAULT 1"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "receipt_show_tax",
    "receipt_show_tax TINYINT(1) NOT NULL DEFAULT 1"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "receipt_show_discounts",
    "receipt_show_discounts TINYINT(1) NOT NULL DEFAULT 1"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "receipt_show_cashier",
    "receipt_show_cashier TINYINT(1) NOT NULL DEFAULT 1"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "language",
    "language VARCHAR(10) DEFAULT 'en'"
  );
  await addColumnIfMissing(
    connection,
    "shops",
    existingShopColumns,
    "tax_percentage",
    "tax_percentage DECIMAL(5,2) NOT NULL DEFAULT 0"
  );

  const [userColumns] = await connection.query("SHOW COLUMNS FROM users");
  const existingUserColumns = new Set(userColumns.map((column) => column.Field));

  await connection.query("ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL");
  await connection.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(50)");

  await addColumnIfMissing(
    connection,
    "users",
    existingUserColumns,
    "username",
    "username VARCHAR(100) NULL"
  );
  await addColumnIfMissing(
    connection,
    "users",
    existingUserColumns,
    "is_active",
    "is_active TINYINT(1) NOT NULL DEFAULT 1"
  );
  await addColumnIfMissing(
    connection,
    "users",
    existingUserColumns,
    "permissions",
    "permissions TEXT NULL"
  );
  await addColumnIfMissing(
    connection,
    "users",
    existingUserColumns,
    "shop_id",
    "shop_id INT NULL"
  );

  const [salesColumns] = await connection.query("SHOW COLUMNS FROM sales");
  const existingSalesColumns = new Set(salesColumns.map((column) => column.Field));

  await addColumnIfMissing(
    connection,
    "sales",
    existingSalesColumns,
    "created_by",
    "created_by INT NULL"
  );
  await addColumnIfMissing(
    connection,
    "sales",
    existingSalesColumns,
    "cashier_name",
    "cashier_name VARCHAR(150) NULL"
  );
  await addColumnIfMissing(
    connection,
    "sales",
    existingSalesColumns,
    "local_offline_id",
    "local_offline_id VARCHAR(100) NULL"
  );
  await addColumnIfMissing(
    connection,
    "sales",
    existingSalesColumns,
    "sync_source",
    "sync_source VARCHAR(30) NOT NULL DEFAULT 'online'"
  );

  const [shopIndexes] = await connection.query("SHOW INDEX FROM shops");
  const shopIndexNames = new Set(shopIndexes.map((index) => index.Key_name));

  if (!shopIndexNames.has("unique_shop_login_email")) {
    await connection.query(
      "ALTER TABLE shops ADD UNIQUE KEY unique_shop_login_email (login_email)"
    );
  }

  if (!shopIndexNames.has("unique_shop_code")) {
    await connection.query("ALTER TABLE shops ADD UNIQUE KEY unique_shop_code (shop_code)");
  }

  const [userIndexes] = await connection.query("SHOW INDEX FROM users");
  const userIndexNames = new Set(userIndexes.map((index) => index.Key_name));

  if (!userIndexNames.has("unique_shop_username")) {
    await connection.query(
      "ALTER TABLE users ADD UNIQUE KEY unique_shop_username (shop_id, username)"
    );
  }

  const [salesIndexes] = await connection.query("SHOW INDEX FROM sales");
  const salesIndexNames = new Set(salesIndexes.map((index) => index.Key_name));

  if (!salesIndexNames.has("unique_shop_offline_sale")) {
    await connection.query(
      "ALTER TABLE sales ADD UNIQUE KEY unique_shop_offline_sale (shop_id, local_offline_id)"
    );
  }

  await connection.query(`
    UPDATE users
    SET username = COALESCE(NULLIF(username, ''), NULLIF(email, ''), CONCAT('user', id))
    WHERE role <> 'admin'
  `);

  ensuredSaasSchema = true;
};

module.exports = { ensureSaasSchema };
