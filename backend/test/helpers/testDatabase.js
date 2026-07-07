const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const { serializeEnabledModules } = require("../../utils/shopModules");
const { UNIT_MASTER_SEED } = require("../../utils/productCatalogSchema");

function assertTestDatabase() {
  if (!process.env.DB_NAME || !process.env.DB_NAME.endsWith("_test")) {
    throw new Error(
      "Refusing to touch a non-test database. DB_NAME must end with _test."
    );
  }
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, "``")}\``;
}

async function ensureTestDatabase() {
  assertTestDatabase();

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: false,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(
      process.env.DB_NAME
    )} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();
}

async function resetTestDatabase(db) {
  assertTestDatabase();

  await db.query("SET FOREIGN_KEY_CHECKS = 0");
  const tables = [
    "notification_delivery_logs",
    "notifications",
    "notification_preferences",
    "notification_templates",
    "admin_alerts",
    "api_request_logs",
    "error_logs",
    "restore_jobs",
    "backup_jobs",
    "payment_verifications",
    "buying_price_history",
    "stock_reconciliation_items",
    "stock_reconciliations",
    "stock_adjustments",
    "stock_batches",
    "grn_items",
    "goods_received_notes",
    "purchase_order_items",
    "purchase_orders",
    "stock_movements",
    "sales_return_items",
    "sales_returns",
    "sale_items",
    "sales",
    "credit_records",
    "supplier_transactions",
    "expenses",
    "products",
    "unit_conversions",
    "unit_master",
    "product_categories",
    "customers",
    "suppliers",
    "audit_logs",
    "login_activity",
    "users",
    "shops",
  ];

  for (const table of tables) {
    await db.query(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`);
  }
  await db.query("SET FOREIGN_KEY_CHECKS = 1");

  await db.query(`
    CREATE TABLE shops (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_name VARCHAR(255) NOT NULL,
      shop_code VARCHAR(100) NOT NULL UNIQUE,
      login_email VARCHAR(255) NOT NULL UNIQUE,
      login_password_hash VARCHAR(255) NOT NULL,
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
      idle_timeout_minutes INT DEFAULT 30,
      background_logout_minutes INT DEFAULT 10,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      permissions TEXT NULL,
      shop_id INT NULL,
      is_active TINYINT(1) DEFAULT 1,
      reset_token_hash VARCHAR(255) NULL,
      reset_token_expires_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_username_shop (username, shop_id),
      UNIQUE KEY unique_email (email),
      CONSTRAINT fk_users_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    )
  `);

  await db.query(`
    CREATE TABLE product_categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_category_shop (shop_id, name),
      CONSTRAINT fk_categories_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    )
  `);

  await db.query(`
    CREATE TABLE unit_master (
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

  await db.query(`
    CREATE TABLE unit_conversions (
      id INT PRIMARY KEY AUTO_INCREMENT,
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

  await db.query(
    `INSERT INTO unit_master
       (code, name, unit_type, allows_decimal, default_precision, is_active, sort_order)
     VALUES ?`,
    [UNIT_MASTER_SEED.map((unit) => [...unit.slice(0, 5), 1, unit[5]])]
  );

  await db.query(
    `INSERT INTO unit_conversions
       (shop_id, from_unit, to_unit, factor, description, is_active)
     VALUES ?`,
    [
      [
        [0, "KG", "G", 1000, "1 KG = 1000 G", 1],
        [0, "G", "KG", 0.001, "1 G = 0.001 KG", 1],
        [0, "L", "ML", 1000, "1 L = 1000 ML", 1],
        [0, "ML", "L", 0.001, "1 ML = 0.001 L", 1],
      ],
    ]
  );

  await db.query(`
    CREATE TABLE products (
      id INT PRIMARY KEY AUTO_INCREMENT,
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
      CONSTRAINT fk_products_shop FOREIGN KEY (shop_id) REFERENCES shops(id),
      CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id)
    )
  `);

  await db.query(`
    CREATE TABLE customers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NULL,
      address TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_customers_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    )
  `);

  await db.query(`
    CREATE TABLE suppliers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      supplier_name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NULL,
      address TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_suppliers_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    )
  `);

  await db.query(`
    CREATE TABLE sales (
      id INT PRIMARY KEY AUTO_INCREMENT,
      invoice_no VARCHAR(100) NULL,
      shop_id INT NOT NULL,
      user_id INT NOT NULL,
      created_by INT NOT NULL,
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
      CONSTRAINT fk_sales_shop FOREIGN KEY (shop_id) REFERENCES shops(id),
      CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.query(`
    CREATE TABLE sale_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
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
      CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
      CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  await db.query(`
    CREATE TABLE payment_verifications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      sale_id INT NOT NULL,
      shop_id INT NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      reference_no VARCHAR(100) NULL,
      approval_code VARCHAR(50) NULL,
      card_last_four VARCHAR(4) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      verified_by INT NULL,
      verified_at DATETIME NULL,
      failed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_payment_verification_sale (sale_id),
      CONSTRAINT fk_payment_verifications_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
      CONSTRAINT fk_payment_verifications_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    )
  `);

  await db.query(`
    CREATE TABLE stock_movements (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      product_id INT NOT NULL,
      user_id INT NULL,
      supplier_id INT NULL,
      movement_type VARCHAR(100) NOT NULL,
      quantity DECIMAL(14,4) NOT NULL,
      previous_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
      new_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
      buying_price DECIMAL(10,2) NULL,
      total_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      note TEXT NULL,
      batch_id INT NULL,
      reference_type VARCHAR(50) NULL,
      reference_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_stock_movements_shop FOREIGN KEY (shop_id) REFERENCES shops(id),
      CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  await db.query(`
    CREATE TABLE purchase_orders (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      supplier_id INT NOT NULL,
      po_number VARCHAR(50) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      expected_date DATE NULL,
      notes TEXT NULL,
      created_by INT NULL,
      submitted_by INT NULL,
      submitted_at DATETIME NULL,
      cancelled_by INT NULL,
      cancelled_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_purchase_order_number (shop_id, po_number),
      INDEX idx_purchase_orders_shop_status (shop_id, status),
      INDEX idx_purchase_orders_supplier (shop_id, supplier_id)
    )
  `);

  await db.query(`
    CREATE TABLE purchase_order_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      purchase_order_id INT NOT NULL,
      shop_id INT NOT NULL,
      product_id INT NOT NULL,
      ordered_quantity INT NOT NULL,
      received_quantity INT NOT NULL DEFAULT 0,
      buying_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      selling_price DECIMAL(10,2) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_po_product (purchase_order_id, product_id),
      INDEX idx_purchase_order_items_shop_product (shop_id, product_id)
    )
  `);

  await db.query(`
    CREATE TABLE goods_received_notes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      purchase_order_id INT NOT NULL,
      supplier_id INT NOT NULL,
      grn_number VARCHAR(50) NULL,
      supplier_invoice_number VARCHAR(100) NOT NULL,
      received_date DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      notes TEXT NULL,
      created_by INT NULL,
      posted_by INT NULL,
      posted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_grn_number (shop_id, grn_number),
      UNIQUE KEY unique_supplier_invoice (shop_id, supplier_id, supplier_invoice_number),
      INDEX idx_grns_shop_status (shop_id, status),
      INDEX idx_grns_purchase_order (shop_id, purchase_order_id)
    )
  `);

  await db.query(`
    CREATE TABLE grn_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      grn_id INT NOT NULL,
      shop_id INT NOT NULL,
      purchase_order_item_id INT NOT NULL,
      product_id INT NOT NULL,
      received_quantity INT NOT NULL,
      buying_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      selling_price DECIMAL(10,2) NULL,
      expiry_date DATE NULL,
      batch_code VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_grn_items_grn (grn_id),
      INDEX idx_grn_items_shop_product (shop_id, product_id)
    )
  `);

  await db.query(`
    CREATE TABLE stock_batches (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      product_id INT NOT NULL,
      supplier_id INT NOT NULL,
      purchase_order_id INT NOT NULL,
      grn_id INT NOT NULL,
      batch_code VARCHAR(100) NOT NULL,
      buying_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      selling_price DECIMAL(10,2) NULL,
      quantity_received INT NOT NULL,
      quantity_remaining INT NOT NULL,
      expiry_date DATE NULL,
      supplier_invoice_number VARCHAR(100) NOT NULL,
      received_date DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_stock_batch_code (shop_id, batch_code),
      INDEX idx_stock_batches_shop_product (shop_id, product_id),
      INDEX idx_stock_batches_supplier (shop_id, supplier_id),
      INDEX idx_stock_batches_grn (shop_id, grn_id),
      INDEX idx_stock_batches_received_date (shop_id, received_date),
      INDEX idx_stock_batches_status (shop_id, status)
    )
  `);

  await db.query(`
    CREATE TABLE buying_price_history (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      product_id INT NOT NULL,
      supplier_id INT NOT NULL,
      purchase_order_id INT NULL,
      grn_id INT NULL,
      old_buying_price DECIMAL(10,2) NULL,
      new_buying_price DECIMAL(10,2) NOT NULL,
      selling_price DECIMAL(10,2) NULL,
      quantity_received INT NOT NULL DEFAULT 0,
      supplier_invoice_number VARCHAR(100) NULL,
      effective_date DATE NOT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_buying_price_history_product (shop_id, product_id, created_at),
      INDEX idx_buying_price_history_grn (shop_id, grn_id)
    )
  `);

  await db.query(`
    CREATE TABLE stock_adjustments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      product_id INT NOT NULL,
      batch_id INT NULL,
      adjustment_number VARCHAR(50) NULL,
      idempotency_key VARCHAR(100) NULL,
      adjustment_type VARCHAR(30) NOT NULL,
      quantity INT NOT NULL,
      previous_stock INT NOT NULL DEFAULT 0,
      new_stock INT NOT NULL DEFAULT 0,
      previous_batch_quantity INT NULL,
      new_batch_quantity INT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'posted',
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_stock_adjustment_number (shop_id, adjustment_number),
      UNIQUE KEY unique_stock_adjustment_idempotency (shop_id, idempotency_key),
      INDEX idx_stock_adjustments_shop_created (shop_id, created_at),
      INDEX idx_stock_adjustments_product (shop_id, product_id),
      INDEX idx_stock_adjustments_batch (shop_id, batch_id),
      INDEX idx_stock_adjustments_type (shop_id, adjustment_type)
    )
  `);

  await db.query(`
    CREATE TABLE stock_reconciliations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      reconciliation_number VARCHAR(50) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      reason TEXT NOT NULL,
      notes TEXT NULL,
      created_by INT NULL,
      posted_by INT NULL,
      posted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_stock_reconciliation_number (shop_id, reconciliation_number),
      INDEX idx_stock_reconciliations_shop_status (shop_id, status),
      INDEX idx_stock_reconciliations_created (shop_id, created_at)
    )
  `);

  await db.query(`
    CREATE TABLE stock_reconciliation_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      reconciliation_id INT NOT NULL,
      shop_id INT NOT NULL,
      product_id INT NOT NULL,
      batch_id INT NULL,
      system_quantity INT NOT NULL DEFAULT 0,
      physical_quantity INT NOT NULL DEFAULT 0,
      variance INT NOT NULL DEFAULT 0,
      previous_stock INT NULL,
      new_stock INT NULL,
      previous_batch_quantity INT NULL,
      new_batch_quantity INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_stock_reconciliation_items_reconciliation (shop_id, reconciliation_id),
      INDEX idx_stock_reconciliation_items_product (shop_id, product_id),
      INDEX idx_stock_reconciliation_items_batch (shop_id, batch_id)
    )
  `);

  await db.query(`
    CREATE TABLE credit_records (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      customer_id INT NULL,
      sale_id INT NULL,
      credit_amount DECIMAL(10,2) DEFAULT 0,
      paid_amount DECIMAL(10,2) DEFAULT 0,
      balance_amount DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_credit_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    )
  `);

  await db.query(`
    CREATE TABLE supplier_transactions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      supplier_id INT NULL,
      description TEXT NULL,
      total_amount DECIMAL(10,2) DEFAULT 0,
      paid_amount DECIMAL(10,2) DEFAULT 0,
      balance_amount DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_supplier_transactions_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    )
  `);

  await db.query(`
    CREATE TABLE expenses (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      category VARCHAR(255) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      expense_date DATE NOT NULL,
      note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_expenses_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
    )
  `);

  await db.query(`
    CREATE TABLE sales_returns (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      sale_id INT NOT NULL,
      refund_amount DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sales_returns_shop FOREIGN KEY (shop_id) REFERENCES shops(id),
      CONSTRAINT fk_sales_returns_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
    )
  `);

  await db.query(`
    CREATE TABLE sales_return_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      return_id INT NOT NULL,
      sale_item_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(14,4) NOT NULL,
      refund_amount DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sales_return_items_return FOREIGN KEY (return_id) REFERENCES sales_returns(id)
    )
  `);

  await db.query(`
    CREATE TABLE audit_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NULL,
      user_id INT NULL,
      user_name VARCHAR(100) NULL,
      user_role VARCHAR(50) NULL,
      action VARCHAR(255) NOT NULL,
      entity_type VARCHAR(100) NULL,
      entity_id INT NULL,
      description TEXT NULL,
      ip_address VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE login_activity (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NULL,
      shop_id INT NULL,
      email VARCHAR(255) NULL,
      role VARCHAR(50) NULL,
      status VARCHAR(50) NOT NULL,
      message VARCHAR(255) NULL,
      ip_address VARCHAR(100) NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE error_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NULL,
      user_id INT NULL,
      request_id VARCHAR(64) NULL,
      error_type VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      stack_trace LONGTEXT NULL,
      method VARCHAR(10) NULL,
      path VARCHAR(500) NULL,
      status_code INT NOT NULL DEFAULT 500,
      request_data TEXT NULL,
      ip_address VARCHAR(100) NULL,
      user_agent VARCHAR(500) NULL,
      environment VARCHAR(30) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_error_logs_created (created_at),
      INDEX idx_error_logs_status_created (status_code, created_at),
      INDEX idx_error_logs_shop_created (shop_id, created_at),
      INDEX idx_error_logs_request_id (request_id)
    )
  `);

  await db.query(`
    CREATE TABLE api_request_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NULL,
      user_id INT NULL,
      request_id VARCHAR(64) NULL,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(500) NOT NULL,
      status_code INT NOT NULL,
      response_time_ms INT NOT NULL DEFAULT 0,
      request_data TEXT NULL,
      ip_address VARCHAR(100) NULL,
      user_agent VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_api_request_logs_created (created_at),
      INDEX idx_api_request_logs_status_created (status_code, created_at),
      INDEX idx_api_request_logs_shop_created (shop_id, created_at),
      INDEX idx_api_request_logs_request_id (request_id)
    )
  `);

  await db.query(`
    CREATE TABLE admin_alerts (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NULL,
      alert_type VARCHAR(100) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'medium',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      source_type VARCHAR(100) NULL,
      source_id BIGINT NULL,
      dedupe_key VARCHAR(191) NULL,
      occurrence_count INT NOT NULL DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'unread',
      read_by INT NULL,
      read_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_admin_alert_dedupe (dedupe_key),
      INDEX idx_admin_alerts_status_created (status, created_at),
      INDEX idx_admin_alerts_type_created (alert_type, created_at),
      INDEX idx_admin_alerts_shop_created (shop_id, created_at),
      INDEX idx_admin_alerts_severity (severity)
    )
  `);

  await db.query(`
    CREATE TABLE notification_templates (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
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

  await db.query(`
    CREATE TABLE notification_preferences (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
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

  await db.query(`
    CREATE TABLE notifications (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
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

  await db.query(`
    CREATE TABLE notification_delivery_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
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

  await db.query(`
    INSERT INTO notification_templates
      (template_key, name, title_template, message_template, default_channels,
       default_priority)
    VALUES
      ('backup_success', 'Backup success', 'Backup completed',
       'The backup for {{shop_name}} completed successfully.',
       '["in_app","email","sms","whatsapp"]', 'low'),
      ('backup_failure', 'Backup failure', 'Backup failed',
       'The backup for {{shop_name}} failed. {{error}}',
       '["in_app","email","sms","whatsapp"]', 'high'),
      ('restore_success', 'Restore success', 'Restore completed',
       'The backup for {{shop_name}} was restored successfully.',
       '["in_app","email","sms","whatsapp"]', 'medium'),
      ('restore_failure', 'Restore failure', 'Restore failed',
       'The restore for {{shop_name}} failed. {{error}}',
       '["in_app","email","sms","whatsapp"]', 'high'),
      ('low_stock', 'Low stock alert', 'Low stock items',
       '{{count}} product(s) are at or below the low stock limit.',
       '["in_app","email","sms","whatsapp"]', 'medium'),
      ('expired_stock', 'Expired stock alert',
       'Expired stock requires attention',
       '{{count}} batch(es) with remaining stock have expired.',
       '["in_app","email","sms","whatsapp"]', 'high'),
      ('credit_due_reminder', 'Credit due reminder',
       'Credit payment reminder',
       'A balance of {{amount}} is due to {{shop_name}}. {{due_date}}',
       '["sms","whatsapp","email"]', 'medium'),
      ('system_error', 'System error alert', 'System alert', '{{message}}',
       '["in_app","email","sms","whatsapp"]', 'high'),
      ('subscription_expiry', 'Subscription expiry reminder',
       'Subscription expiring soon', '{{message}}',
       '["in_app","email","sms","whatsapp"]', 'high'),
      ('test_notification', 'Test notification',
       'ShopMate notification test',
       'Notification delivery test requested by {{requested_by}}.',
       '["in_app","email","sms","whatsapp"]', 'low')
  `);

  await db.query(`
    CREATE TABLE backup_jobs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      requested_by INT NULL,
      backup_type VARCHAR(30) NOT NULL DEFAULT 'manual',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      storage_type VARCHAR(30) NULL,
      file_name VARCHAR(255) NULL,
      file_path TEXT NULL,
      backup_data LONGTEXT NULL,
      checksum VARCHAR(128) NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      record_count INT NOT NULL DEFAULT 0,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_backup_jobs_shop_created (shop_id, created_at),
      INDEX idx_backup_jobs_status (status),
      INDEX idx_backup_jobs_requested_by (requested_by)
    )
  `);

  await db.query(`
    CREATE TABLE restore_jobs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shop_id INT NOT NULL,
      requested_by INT NULL,
      backup_job_id INT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      source_file_name VARCHAR(255) NULL,
      checksum VARCHAR(128) NULL,
      record_count INT NOT NULL DEFAULT 0,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_restore_jobs_shop_created (shop_id, created_at),
      INDEX idx_restore_jobs_status (status),
      INDEX idx_restore_jobs_requested_by (requested_by)
    )
  `);
}

async function seedTestData(db) {
  assertTestDatabase();

  const passwordHash = await bcrypt.hash("Password#123", 10);
  const shopAHash = await bcrypt.hash("ShopA#123", 10);
  const shopBHash = await bcrypt.hash("ShopB#123", 10);

  const permissions = {
    owner: JSON.stringify(["all"]),
    staff: JSON.stringify(["dashboard_view", "products_view", "pos_access"]),
  };

  await db.query(
    `INSERT INTO shops (
      id, shop_name, shop_code, login_email, login_password_hash, owner_name,
      shop_type, enabled_modules, phone, email, address, subscription_status, subscription_expiry_date,
      is_enabled
    ) VALUES
      (101, 'Shop A', 'SHOP-A', 'shop-a@test.lk', ?, 'Owner A',
       'custom', ?,
       '0710000001', 'owner-a@test.lk', 'Colombo', 'active', DATE_ADD(CURDATE(), INTERVAL 30 DAY), 1),
      (202, 'Shop B', 'SHOP-B', 'shop-b@test.lk', ?, 'Owner B',
       'custom', ?,
       '0710000002', 'owner-b@test.lk', 'Kandy', 'active', DATE_ADD(CURDATE(), INTERVAL 30 DAY), 1)`,
    [
      shopAHash,
      serializeEnabledModules(undefined, "custom"),
      shopBHash,
      serializeEnabledModules(undefined, "custom"),
    ]
  );

  await db.query(
    `INSERT INTO users (
      id, name, username, email, password, role, permissions, shop_id, is_active
    ) VALUES
      (1, 'Admin User', 'admin', 'admin@test.lk', ?, 'admin', ?, NULL, 1),
      (11, 'Owner A', 'owner_a', 'owner-a@test.lk', ?, 'owner', ?, 101, 1),
      (12, 'Staff A', 'staff_a', 'staff-a@test.lk', ?, 'staff', ?, 101, 1),
      (21, 'Owner B', 'owner_b', 'owner-b@test.lk', ?, 'owner', ?, 202, 1)`,
    [
      passwordHash,
      permissions.owner,
      passwordHash,
      permissions.owner,
      passwordHash,
      permissions.staff,
      passwordHash,
      permissions.owner,
    ]
  );

  await db.query(`
    INSERT INTO product_categories (id, shop_id, name, description) VALUES
      (301, 101, 'Grocery', 'Shop A grocery items'),
      (302, 202, 'Grocery', 'Shop B grocery items')
  `);

  await db.query(`
    INSERT INTO products (
      id, shop_id, product_name, product_code, barcode, category, category_id,
      buying_price, wholesale_price, selling_price, stock_quantity, low_stock_limit
    ) VALUES
      (501, 101, 'Shop A Rice', 'A-RICE', 'A0001', 'Grocery', 301, 100.00, 115.00, 130.00, 20, 5),
      (601, 202, 'Shop B Rice', 'B-RICE', 'B0001', 'Grocery', 302, 90.00, 105.00, 120.00, 30, 5)
  `);

  await db.query(`
    INSERT INTO customers (id, shop_id, customer_name, phone, address) VALUES
      (701, 101, 'Customer A', '0770000001', 'Colombo')
  `);

  await db.query(`
    INSERT INTO suppliers (id, shop_id, supplier_name, phone, address) VALUES
      (801, 101, 'Supplier A', '0770000002', 'Colombo'),
      (802, 202, 'Supplier B', '0770000003', 'Kandy')
  `);

  return {
    admin: {
      email: "admin@test.lk",
      username: "admin",
      password: "Password#123",
    },
    shopA: {
      id: 101,
      email: "shop-a@test.lk",
      password: "ShopA#123",
      owner: { username: "owner_a", password: "Password#123", id: 11 },
      staff: { username: "staff_a", password: "Password#123", id: 12 },
      productId: 501,
      categoryId: 301,
      customerId: 701,
      supplierId: 801,
    },
    shopB: {
      id: 202,
      email: "shop-b@test.lk",
      password: "ShopB#123",
      owner: { username: "owner_b", password: "Password#123", id: 21 },
      productId: 601,
      categoryId: 302,
      supplierId: 802,
    },
  };
}

async function resetAndSeed(db) {
  await resetTestDatabase(db);
  return seedTestData(db);
}

async function getProductStock(db, productId) {
  const [rows] = await db.query(
    "SELECT stock_quantity FROM products WHERE id = ?",
    [productId]
  );
  return rows[0] ? Number(rows[0].stock_quantity) : undefined;
}

async function getBatchRemaining(db, batchId) {
  const [rows] = await db.query(
    "SELECT quantity_remaining FROM stock_batches WHERE id = ?",
    [batchId]
  );
  return rows[0]?.quantity_remaining;
}

module.exports = {
  assertTestDatabase,
  getBatchRemaining,
  ensureTestDatabase,
  resetTestDatabase,
  resetAndSeed,
  seedTestData,
  getProductStock,
};
