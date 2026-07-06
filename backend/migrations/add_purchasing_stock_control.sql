CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  INDEX idx_purchase_orders_supplier (shop_id, supplier_id),
  INDEX idx_purchase_orders_created (shop_id, created_at)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  INDEX idx_purchase_order_items_shop_product (shop_id, product_id),
  INDEX idx_purchase_order_items_po (purchase_order_id)
);

CREATE TABLE IF NOT EXISTS goods_received_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  INDEX idx_grns_supplier_date (shop_id, supplier_id, received_date),
  INDEX idx_grns_purchase_order (shop_id, purchase_order_id)
);

CREATE TABLE IF NOT EXISTS grn_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
);

CREATE TABLE IF NOT EXISTS stock_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  INDEX idx_stock_batches_expiry (shop_id, expiry_date),
  INDEX idx_stock_batches_status (shop_id, status)
);

CREATE TABLE IF NOT EXISTS buying_price_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  INDEX idx_buying_price_history_supplier (shop_id, supplier_id, created_at),
  INDEX idx_buying_price_history_grn (shop_id, grn_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  product_id INT NOT NULL,
  user_id INT NULL,
  supplier_id INT NULL,
  movement_type VARCHAR(50) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  previous_stock INT NOT NULL DEFAULT 0,
  new_stock INT NOT NULL DEFAULT 0,
  buying_price DECIMAL(10,2) NULL,
  total_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stock_movements_shop_created (shop_id, created_at),
  INDEX idx_stock_movements_product_created (product_id, created_at),
  INDEX idx_stock_movements_type (movement_type)
);

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS batch_id INT NULL,
  ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS reference_id INT NULL;
