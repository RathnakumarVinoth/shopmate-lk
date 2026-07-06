CREATE TABLE IF NOT EXISTS sale_item_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  sale_id INT NOT NULL,
  sale_item_id INT NOT NULL,
  product_id INT NOT NULL,
  batch_id INT NOT NULL,
  quantity_deducted INT NOT NULL DEFAULT 0,
  quantity_restored INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_sale_item_batch (shop_id, sale_item_id, batch_id),
  INDEX idx_sale_item_batches_shop_sale (shop_id, sale_id),
  INDEX idx_sale_item_batches_sale_item (shop_id, sale_item_id),
  INDEX idx_sale_item_batches_product (shop_id, product_id),
  INDEX idx_sale_item_batches_batch (shop_id, batch_id)
);
