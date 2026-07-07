const mysql = require("mysql2/promise");
require("dotenv").config();

const requiredEnv = ["DB_HOST", "DB_USER", "DB_NAME"];

const quoteIdentifier = (identifier) =>
  `\`${String(identifier).replace(/`/g, "``")}\``;

const requireDatabaseEnv = () => {
  const missing = requiredEnv.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required database environment variable(s): ${missing.join(", ")}`);
  }
};

const createServerConnection = () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    multipleStatements: false,
  });

const createDatabaseConnection = () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

const ensureDatabase = async () => {
  const connection = await createServerConnection();

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(
        process.env.DB_NAME
      )} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
};

const ensureMigrationLogTable = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(191) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      run_count INT NOT NULL DEFAULT 0,
      last_started_at DATETIME NULL,
      last_finished_at DATETIME NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_schema_migration_name (migration_name),
      INDEX idx_schema_migrations_status (status)
    )
  `);
};

const markMigrationStarted = async (connection, name) => {
  await connection.query(
    `INSERT INTO schema_migrations
       (migration_name, status, run_count, last_started_at, error_message)
     VALUES (?, 'running', 1, NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       status = 'running',
       run_count = run_count + 1,
       last_started_at = NOW(),
       error_message = NULL`,
    [name]
  );
};

const markMigrationFinished = async (connection, name) => {
  await connection.query(
    `UPDATE schema_migrations
     SET status = 'success', last_finished_at = NOW(), error_message = NULL
     WHERE migration_name = ?`,
    [name]
  );
};

const markMigrationFailed = async (connection, name, error) => {
  await connection.query(
    `UPDATE schema_migrations
     SET status = 'failed', last_finished_at = NOW(), error_message = ?
     WHERE migration_name = ?`,
    [String(error.message || error).slice(0, 5000), name]
  );
};

const ensureCoreSchema = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS shops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_name VARCHAR(255) NOT NULL,
      shop_code VARCHAR(100) NULL,
      login_email VARCHAR(255) NULL,
      login_password_hash VARCHAR(255) NULL,
      owner_id INT NULL,
      owner_name VARCHAR(255) NULL,
      shop_type VARCHAR(50) NOT NULL DEFAULT 'custom',
      enabled_modules TEXT NULL,
      phone VARCHAR(50) NULL,
      email VARCHAR(255) NULL,
      address TEXT NULL,
      receipt_footer TEXT NULL,
      logo_url TEXT NULL,
      receipt_show_logo TINYINT(1) NOT NULL DEFAULT 1,
      receipt_show_tax TINYINT(1) NOT NULL DEFAULT 1,
      receipt_show_discounts TINYINT(1) NOT NULL DEFAULT 1,
      receipt_show_cashier TINYINT(1) NOT NULL DEFAULT 1,
      open_cash_drawer_after_print TINYINT(1) NOT NULL DEFAULT 0,
      language VARCHAR(20) DEFAULT 'en',
      currency VARCHAR(20) DEFAULT 'LKR',
      default_low_stock_limit INT DEFAULT 5,
      tax_percentage DECIMAL(10,2) DEFAULT 0,
      default_receipt_size VARCHAR(50) DEFAULT '80mm',
      subscription_plan VARCHAR(50) DEFAULT 'basic',
      subscription_status VARCHAR(50) DEFAULT 'active',
      subscription_start_date DATE NULL,
      subscription_expiry_date DATE NULL,
      monthly_fee DECIMAL(10,2) DEFAULT 0,
      is_enabled TINYINT(1) DEFAULT 1,
      created_by_admin INT NULL,
      idle_timeout_minutes INT DEFAULT 15,
      background_logout_minutes INT DEFAULT 3,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      username VARCHAR(255) NULL,
      email VARCHAR(255) NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      permissions TEXT NULL,
      shop_id INT NULL,
      is_active TINYINT(1) DEFAULT 1,
      reset_token_hash VARCHAR(255) NULL,
      reset_token_expires_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_users_shop_role (shop_id, role)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_product_category_per_shop (shop_id, name),
      INDEX idx_product_categories_shop_active (shop_id, is_active)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS unit_master (
      code VARCHAR(20) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      unit_type VARCHAR(40) NOT NULL DEFAULT 'count',
      allows_decimal TINYINT(1) NOT NULL DEFAULT 0,
      default_precision TINYINT UNSIGNED NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_unit_master_active_sort (is_active, sort_order)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS unit_conversions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NULL,
      from_unit VARCHAR(20) NOT NULL,
      to_unit VARCHAR(20) NOT NULL,
      factor DECIMAL(18,6) NOT NULL,
      description VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_unit_conversion_scope (shop_id, from_unit, to_unit),
      INDEX idx_unit_conversions_scope (shop_id, is_active),
      INDEX idx_unit_conversions_units (from_unit, to_unit)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      product_code VARCHAR(100) NULL,
      barcode VARCHAR(100) NULL,
      category VARCHAR(255) NULL,
      category_id INT NULL,
      unit VARCHAR(50) DEFAULT 'PCS',
      buying_price DECIMAL(10,2) DEFAULT 0,
      wholesale_price DECIMAL(10,2) DEFAULT 0,
      selling_price DECIMAL(10,2) DEFAULT 0,
      stock_quantity DECIMAL(14,4) DEFAULT 0,
      low_stock_limit DECIMAL(14,4) DEFAULT 5,
      image_url TEXT NULL,
      item_type VARCHAR(20) NOT NULL DEFAULT 'product',
      default_selling_unit VARCHAR(20) NOT NULL DEFAULT 'PCS',
      default_purchase_unit VARCHAR(20) NOT NULL DEFAULT 'PCS',
      base_unit VARCHAR(20) NOT NULL DEFAULT 'PCS',
      allow_decimal_qty TINYINT(1) NOT NULL DEFAULT 0,
      quantity_precision TINYINT UNSIGNED NOT NULL DEFAULT 0,
      tracking_method VARCHAR(30) NOT NULL DEFAULT 'SIMPLE_STOCK',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_product_code_shop (shop_id, product_code),
      UNIQUE KEY unique_barcode_shop (shop_id, barcode),
      INDEX idx_products_shop_category (shop_id, category_id),
      INDEX idx_products_shop_stock (shop_id, stock_quantity)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NULL,
      address TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_customers_shop_name (shop_id, customer_name)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      supplier_name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NULL,
      address TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_suppliers_shop_name (shop_id, supplier_name)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_no VARCHAR(100) NULL,
      shop_id INT NOT NULL,
      user_id INT NOT NULL,
      created_by INT NULL,
      customer_id INT NULL,
      subtotal DECIMAL(10,2) DEFAULT 0,
      item_discount_total DECIMAL(10,2) DEFAULT 0,
      bill_discount DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      tax_percentage DECIMAL(10,2) DEFAULT 0,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      total_before_tax DECIMAL(10,2) DEFAULT 0,
      total_amount DECIMAL(10,2) DEFAULT 0,
      total_profit DECIMAL(10,2) DEFAULT 0,
      payment_type VARCHAR(50) NOT NULL,
      paid_amount DECIMAL(10,2) DEFAULT 0,
      balance_amount DECIMAL(10,2) DEFAULT 0,
      payment_status VARCHAR(50) DEFAULT 'verified',
      payment_reference VARCHAR(255) NULL,
      approval_code VARCHAR(255) NULL,
      card_last_four VARCHAR(4) NULL,
      cashier_name VARCHAR(255) NULL,
      local_offline_id VARCHAR(255) NULL,
      sync_source VARCHAR(50) DEFAULT 'online',
      verified_by INT NULL,
      verified_at DATETIME NULL,
      stock_restored_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_shop_created (shop_id, created_at),
      INDEX idx_sales_shop_payment_status (shop_id, payment_status)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(14,4) NOT NULL,
      buying_price DECIMAL(10,2) DEFAULT 0,
      selling_price DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      item_discount DECIMAL(10,2) DEFAULT 0,
      item_discount_type VARCHAR(20) DEFAULT 'amount',
      tax_percentage DECIMAL(10,2) DEFAULT 0,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      line_total_before_tax DECIMAL(10,2) DEFAULT 0,
      line_total DECIMAL(10,2) DEFAULT 0,
      subtotal DECIMAL(10,2) DEFAULT 0,
      profit DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sale_items_sale (sale_id),
      INDEX idx_sale_items_product (product_id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS credit_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      customer_id INT NULL,
      sale_id INT NULL,
      credit_amount DECIMAL(10,2) DEFAULT 0,
      paid_amount DECIMAL(10,2) DEFAULT 0,
      balance_amount DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_credit_records_shop_status (shop_id, status)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS supplier_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      supplier_id INT NULL,
      description TEXT NULL,
      total_amount DECIMAL(10,2) DEFAULT 0,
      paid_amount DECIMAL(10,2) DEFAULT 0,
      balance_amount DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_supplier_transactions_shop_status (shop_id, status)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      category VARCHAR(255) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      expense_date DATE NOT NULL,
      note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_expenses_shop_date (shop_id, expense_date)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sales_returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      sale_id INT NOT NULL,
      refund_amount DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_returns_shop_created (shop_id, created_at),
      INDEX idx_sales_returns_sale (sale_id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sales_return_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      return_id INT NOT NULL,
      sale_item_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(14,4) NOT NULL,
      refund_amount DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_return_items_return (return_id)
    )
  `);
};

const closeAppPool = async (db) =>
  new Promise((resolve, reject) => {
    db.end((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const ensureModuleSchemas = async () => {
  const db = require("../config/db");
  const { ensureAuditLogsTable } = require("../utils/auditLog");
  const { ensureBackupSchema } = require("../utils/backupSchema");
  const { ensureMonitoringSchema } = require("../utils/monitoringSchema");
  const { ensureNotificationSchema } = require("../utils/notificationSchema");
  const {
    ensurePaymentVerificationTable,
    ensureSalesPaymentColumns,
    ensureStockMovementsTable,
  } = require("../utils/paymentSchema");
  const { ensureProductCatalogSchema } = require("../utils/productCatalogSchema");
  const { ensurePurchasingSchema } = require("../utils/purchasingSchema");
  const { ensureSaasSchema } = require("../utils/saasSchema");
  const { ensureSecurityTables } = require("../utils/security");
  const { ensureShopSettingsColumns } = require("../utils/shopSchema");
  const { ensureStockControlSchema } = require("../utils/stockControlSchema");
  const { ensureUserPermissionColumns } = require("../utils/permissions");

  try {
    await ensureSaasSchema();
    await ensureShopSettingsColumns();
    await ensureSecurityTables();
    await ensureUserPermissionColumns();
    await ensureAuditLogsTable();
    await ensureProductCatalogSchema();
    await ensureSalesPaymentColumns();
    await ensurePaymentVerificationTable();
    await ensureStockMovementsTable();
    await ensurePurchasingSchema();
    await ensureStockControlSchema();
    await ensureBackupSchema();
    await ensureMonitoringSchema();
    await ensureNotificationSchema();
  } finally {
    await closeAppPool(db);
  }
};

const runLoggedStep = async (connection, name, run) => {
  console.log(`Running ${name}...`);
  await markMigrationStarted(connection, name);

  try {
    await run();
    await markMigrationFinished(connection, name);
    console.log(`Finished ${name}`);
  } catch (error) {
    await markMigrationFailed(connection, name, error);
    throw error;
  }
};

const main = async () => {
  requireDatabaseEnv();

  console.log(`Preparing database ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
  await ensureDatabase();

  const connection = await createDatabaseConnection();

  try {
    await ensureMigrationLogTable(connection);
    await runLoggedStep(connection, "000_core_schema", () => ensureCoreSchema(connection));
    await runLoggedStep(connection, "010_module_schema_helpers", ensureModuleSchemas);
    console.log("Database migration completed successfully");
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
});
