const db = require("../config/db");
const { ensurePurchasingSchema } = require("./purchasingSchema");

let saleBatchSchemaReady = false;

const addColumnIfMissing = async (connection, table, existingColumns, name, definition) => {
  if (!existingColumns.has(name)) {
    await connection.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    existingColumns.add(name);
  }
};

const addIndexIfMissing = async (connection, table, name, definition) => {
  const [indexes] = await connection.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [
    name,
  ]);

  if (indexes.length === 0) {
    await connection.query(`ALTER TABLE ${table} ADD INDEX ${name} ${definition}`);
  }
};

const addUniqueIfMissing = async (connection, table, name, definition) => {
  const [indexes] = await connection.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [
    name,
  ]);

  if (indexes.length === 0) {
    await connection.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${name} ${definition}`);
  }
};

const ensureSaleBatchSchema = async () => {
  if (saleBatchSchemaReady) return;

  await ensurePurchasingSchema();
  const connection = db.promise();

  await connection.query(`
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
    )
  `);

  const [columns] = await connection.query("SHOW COLUMNS FROM sale_item_batches");
  const existingColumns = new Set(columns.map((column) => column.Field));

  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "shop_id",
    "shop_id INT NOT NULL"
  );
  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "sale_id",
    "sale_id INT NOT NULL"
  );
  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "sale_item_id",
    "sale_item_id INT NOT NULL"
  );
  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "product_id",
    "product_id INT NOT NULL"
  );
  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "batch_id",
    "batch_id INT NOT NULL"
  );
  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "quantity_deducted",
    "quantity_deducted INT NOT NULL DEFAULT 0"
  );
  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "quantity_restored",
    "quantity_restored INT NOT NULL DEFAULT 0"
  );
  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "created_at",
    "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
  );
  await addColumnIfMissing(
    connection,
    "sale_item_batches",
    existingColumns,
    "updated_at",
    "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  );

  await addUniqueIfMissing(
    connection,
    "sale_item_batches",
    "unique_sale_item_batch",
    "(shop_id, sale_item_id, batch_id)"
  );
  await addIndexIfMissing(
    connection,
    "sale_item_batches",
    "idx_sale_item_batches_shop_sale",
    "(shop_id, sale_id)"
  );
  await addIndexIfMissing(
    connection,
    "sale_item_batches",
    "idx_sale_item_batches_sale_item",
    "(shop_id, sale_item_id)"
  );
  await addIndexIfMissing(
    connection,
    "sale_item_batches",
    "idx_sale_item_batches_product",
    "(shop_id, product_id)"
  );
  await addIndexIfMissing(
    connection,
    "sale_item_batches",
    "idx_sale_item_batches_batch",
    "(shop_id, batch_id)"
  );

  saleBatchSchemaReady = true;
};

module.exports = { ensureSaleBatchSchema };
