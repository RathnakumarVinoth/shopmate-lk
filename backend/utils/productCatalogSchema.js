const db = require("../config/db");

let ensuredProductCatalogSchema = false;

const hasColumn = (columns, name) => columns.has(name);

const ensureProductCatalogSchema = async () => {
  if (ensuredProductCatalogSchema) return;

  await db.promise().query(`
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
    )
  `);

  const [columns] = await db.promise().query("SHOW COLUMNS FROM products");
  const existingColumns = new Set(columns.map((column) => column.Field));

  if (!hasColumn(existingColumns, "category_id")) {
    await db
      .promise()
      .query("ALTER TABLE products ADD COLUMN category_id INT NULL AFTER category");
  }

  if (!hasColumn(existingColumns, "unit")) {
    await db
      .promise()
      .query("ALTER TABLE products ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT 'pcs' AFTER category_id");
  }

  if (!hasColumn(existingColumns, "wholesale_price")) {
    await db
      .promise()
      .query("ALTER TABLE products ADD COLUMN wholesale_price DECIMAL(10,2) NULL AFTER buying_price");
  }

  if (!hasColumn(existingColumns, "image_url")) {
    await db
      .promise()
      .query("ALTER TABLE products ADD COLUMN image_url VARCHAR(500) NULL AFTER low_stock_limit");
  }

  await db.promise().query(`
    INSERT IGNORE INTO product_categories (shop_id, name, is_active)
    SELECT DISTINCT shop_id, TRIM(category), 1
    FROM products
    WHERE category IS NOT NULL AND TRIM(category) <> ''
  `);

  await db.promise().query(`
    UPDATE products
    INNER JOIN product_categories
      ON product_categories.shop_id = products.shop_id
     AND LOWER(product_categories.name) = LOWER(TRIM(products.category))
    SET products.category_id = product_categories.id
    WHERE products.category_id IS NULL
      AND products.category IS NOT NULL
      AND TRIM(products.category) <> ''
  `);

  await db.promise().query(`
    UPDATE products
    SET wholesale_price = buying_price
    WHERE wholesale_price IS NULL
  `);

  ensuredProductCatalogSchema = true;
};

module.exports = { ensureProductCatalogSchema };
