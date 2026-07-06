const db = require("../config/db");
const { ensurePurchasingSchema } = require("./purchasingSchema");

let stockControlSchemaReady = false;

const ensureStockControlSchema = async () => {
  if (stockControlSchemaReady) return;

  await ensurePurchasingSchema();

  const connection = db.promise();

  await connection.query(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INT AUTO_INCREMENT PRIMARY KEY,
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

  await connection.query(`
    CREATE TABLE IF NOT EXISTS stock_reconciliations (
      id INT AUTO_INCREMENT PRIMARY KEY,
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

  await connection.query(`
    CREATE TABLE IF NOT EXISTS stock_reconciliation_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
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

  stockControlSchemaReady = true;
};

module.exports = { ensureStockControlSchema };
