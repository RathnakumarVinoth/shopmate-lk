CREATE TABLE IF NOT EXISTS product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_product_category_per_shop (shop_id, name),
  INDEX idx_product_categories_shop_active (shop_id, is_active),
  CONSTRAINT fk_product_categories_shop
    FOREIGN KEY (shop_id) REFERENCES shops(id)
    ON DELETE CASCADE
);

ALTER TABLE products
  ADD COLUMN category_id INT NULL AFTER category,
  ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT 'pcs' AFTER category_id,
  ADD COLUMN wholesale_price DECIMAL(10,2) NULL AFTER buying_price,
  ADD COLUMN image_url VARCHAR(500) NULL AFTER low_stock_limit;

INSERT IGNORE INTO product_categories (shop_id, name, is_active)
SELECT DISTINCT shop_id, TRIM(category), 1
FROM products
WHERE category IS NOT NULL AND TRIM(category) <> '';

UPDATE products
INNER JOIN product_categories
  ON product_categories.shop_id = products.shop_id
 AND LOWER(product_categories.name) = LOWER(TRIM(products.category))
SET products.category_id = product_categories.id
WHERE products.category_id IS NULL
  AND products.category IS NOT NULL
  AND TRIM(products.category) <> '';

UPDATE products
SET wholesale_price = buying_price
WHERE wholesale_price IS NULL;

ALTER TABLE products
  ADD INDEX idx_products_shop_category (shop_id, category_id),
  ADD CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES product_categories(id)
    ON DELETE SET NULL;
