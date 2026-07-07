const db = require("../config/db");

let ensuredProductCatalogSchema = false;

const UNIT_MASTER_SEED = [
  ["PCS", "Pieces", "count", 0, 0, 10],
  ["PACK", "Pack", "count", 0, 0, 20],
  ["BOX", "Box", "count", 0, 0, 30],
  ["CARTON", "Carton", "count", 0, 0, 40],
  ["DOZEN", "Dozen", "count", 0, 0, 50],
  ["PAIR", "Pair", "count", 0, 0, 60],
  ["SET", "Set", "count", 0, 0, 70],
  ["BUNDLE", "Bundle", "count", 0, 0, 80],
  ["ROLL", "Roll", "count", 0, 0, 90],
  ["BAG", "Bag", "count", 0, 0, 100],
  ["BOTTLE", "Bottle", "count", 0, 0, 110],
  ["CAN", "Can", "count", 0, 0, 120],
  ["SACHET", "Sachet", "count", 0, 0, 130],
  ["KG", "Kilogram", "weight", 1, 3, 200],
  ["G", "Gram", "weight", 1, 2, 210],
  ["L", "Litre", "volume", 1, 3, 300],
  ["ML", "Millilitre", "volume", 1, 2, 310],
  ["M", "Metre", "length", 1, 3, 400],
  ["CM", "Centimetre", "length", 1, 2, 410],
  ["FT", "Feet", "length", 1, 2, 420],
  ["IN", "Inch", "length", 1, 2, 430],
  ["SQFT", "Square feet", "area", 1, 2, 500],
  ["SQM", "Square metre", "area", 1, 3, 510],
  ["SHEET", "Sheet", "count", 0, 0, 600],
  ["BAR", "Bar", "count", 0, 0, 610],
  ["COIL", "Coil", "count", 0, 0, 620],
  ["SERVICE", "Service", "service", 0, 0, 700],
  ["HOUR", "Hour", "time", 1, 2, 710],
  ["JOB", "Job", "service", 0, 0, 720],
];

const UNIT_CONVERSION_SEED = [
  ["KG", "G", 1000, "1 KG = 1000 G"],
  ["G", "KG", 0.001, "1 G = 0.001 KG"],
  ["L", "ML", 1000, "1 L = 1000 ML"],
  ["ML", "L", 0.001, "1 ML = 0.001 L"],
  ["M", "CM", 100, "1 M = 100 CM"],
  ["CM", "M", 0.01, "1 CM = 0.01 M"],
  ["FT", "IN", 12, "1 FT = 12 IN"],
  ["IN", "FT", 0.083333, "1 IN = 0.083333 FT"],
];

const ITEM_TYPES = ["product", "service", "bundle", "non_stock"];

const TRACKING_METHODS = [
  "SIMPLE_STOCK",
  "VARIANT_STOCK",
  "BATCH_STOCK",
  "SERIAL_STOCK",
  "WEIGHT_STOCK",
  "LENGTH_STOCK",
  "AREA_STOCK",
  "SERVICE_ONLY",
  "BUNDLE_KIT",
];

const DECIMAL_UNIT_CODES = new Set(
  UNIT_MASTER_SEED.filter((unit) => Number(unit[3]) === 1).map((unit) => unit[0])
);

const legacyUnitMap = {
  pcs: "PCS",
  pc: "PCS",
  piece: "PCS",
  pieces: "PCS",
  packet: "PACK",
  pack: "PACK",
  box: "BOX",
  carton: "CARTON",
  dozen: "DOZEN",
  pair: "PAIR",
  set: "SET",
  bundle: "BUNDLE",
  roll: "ROLL",
  bag: "BAG",
  bottle: "BOTTLE",
  can: "CAN",
  sachet: "SACHET",
  kg: "KG",
  g: "G",
  gram: "G",
  grams: "G",
  l: "L",
  litre: "L",
  liter: "L",
  ml: "ML",
  m: "M",
  metre: "M",
  meter: "M",
  cm: "CM",
  ft: "FT",
  feet: "FT",
  in: "IN",
  inch: "IN",
  sqft: "SQFT",
  sqm: "SQM",
  sheet: "SHEET",
  bar: "BAR",
  coil: "COIL",
  service: "SERVICE",
  hour: "HOUR",
  job: "JOB",
};

const hasColumn = (columns, name) => columns.has(name);

const normalizeUnitCode = (value, fallback = "PCS") => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const raw = String(value).trim();
  const mapped = legacyUnitMap[raw.toLowerCase()] || raw.toUpperCase();
  const knownUnits = new Set(UNIT_MASTER_SEED.map((unit) => unit[0]));

  return knownUnits.has(mapped) ? mapped : fallback;
};

const getUnitDefaults = (unitCode) => {
  const normalizedUnitCode = normalizeUnitCode(unitCode);
  const unit = UNIT_MASTER_SEED.find((entry) => entry[0] === normalizedUnitCode);

  return {
    code: normalizedUnitCode,
    allow_decimal_qty: Number(unit?.[3] || 0),
    quantity_precision: Number(unit?.[4] || 0),
  };
};

const getUnitMasterSeed = () =>
  UNIT_MASTER_SEED.map(([code, name, unit_type, allows_decimal, default_precision]) => ({
    code,
    name,
    unit_type,
    allows_decimal: Boolean(allows_decimal),
    default_precision,
  }));

const getColumnSet = async (connection, tableName) => {
  const [columns] = await connection.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set(columns.map((column) => column.Field));
};

const addColumnIfMissing = async (connection, columns, tableName, name, definition) => {
  if (columns.has(name)) return;

  await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  columns.add(name);
};

const ensureUnitMasterColumns = async (connection) => {
  const columns = await getColumnSet(connection, "unit_master");

  await addColumnIfMissing(
    connection,
    columns,
    "unit_master",
    "unit_code",
    "unit_code VARCHAR(20) NULL"
  );
  await addColumnIfMissing(
    connection,
    columns,
    "unit_master",
    "unit_name",
    "unit_name VARCHAR(100) NULL"
  );
  await addColumnIfMissing(
    connection,
    columns,
    "unit_master",
    "unit_type",
    "unit_type VARCHAR(40) NOT NULL DEFAULT 'count'"
  );
  await addColumnIfMissing(
    connection,
    columns,
    "unit_master",
    "decimal_allowed",
    "decimal_allowed TINYINT(1) NULL"
  );
  await addColumnIfMissing(
    connection,
    columns,
    "unit_master",
    "default_precision",
    "default_precision TINYINT UNSIGNED NOT NULL DEFAULT 0"
  );
  await addColumnIfMissing(
    connection,
    columns,
    "unit_master",
    "is_active",
    "is_active TINYINT(1) NOT NULL DEFAULT 1"
  );
  await addColumnIfMissing(
    connection,
    columns,
    "unit_master",
    "sort_order",
    "sort_order INT NOT NULL DEFAULT 0"
  );

  if (columns.has("unit_code") && columns.has("code")) {
    await connection.query(`
      UPDATE unit_master
      SET unit_code = UPPER(TRIM(code))
      WHERE (unit_code IS NULL OR TRIM(unit_code) = '')
        AND code IS NOT NULL
        AND TRIM(code) <> ''
    `);
  }

  if (columns.has("unit_name") && columns.has("name")) {
    await connection.query(`
      UPDATE unit_master
      SET unit_name = name
      WHERE (unit_name IS NULL OR TRIM(unit_name) = '')
        AND name IS NOT NULL
        AND TRIM(name) <> ''
    `);
  }

  if (columns.has("decimal_allowed") && columns.has("allows_decimal")) {
    await connection.query(`
      UPDATE unit_master
      SET decimal_allowed = allows_decimal
      WHERE decimal_allowed IS NULL
    `);
  }

  await connection.query(`
    UPDATE unit_master
    SET unit_code = UPPER(TRIM(unit_code)),
        decimal_allowed = COALESCE(decimal_allowed, 0)
    WHERE unit_code IS NOT NULL
  `);

  return columns;
};

const seedUnitMaster = async (connection, columns) => {
  for (const unit of UNIT_MASTER_SEED) {
    const [unitCode, unitName, unitType, decimalAllowed, defaultPrecision, sortOrder] = unit;
    const assignments = [];
    const values = [];

    if (columns.has("unit_code")) {
      assignments.push("unit_code = ?");
      values.push(unitCode);
    }

    if (columns.has("unit_name")) {
      assignments.push("unit_name = ?");
      values.push(unitName);
    }

    if (columns.has("unit_type")) {
      assignments.push("unit_type = ?");
      values.push(unitType);
    }

    if (columns.has("decimal_allowed")) {
      assignments.push("decimal_allowed = ?");
      values.push(decimalAllowed);
    }

    if (columns.has("default_precision")) {
      assignments.push("default_precision = ?");
      values.push(defaultPrecision);
    }

    if (columns.has("is_active")) {
      assignments.push("is_active = 1");
    }

    if (columns.has("sort_order")) {
      assignments.push("sort_order = ?");
      values.push(sortOrder);
    }

    if (columns.has("code")) {
      assignments.push("code = ?");
      values.push(unitCode);
    }

    if (columns.has("name")) {
      assignments.push("name = ?");
      values.push(unitName);
    }

    if (columns.has("allows_decimal")) {
      assignments.push("allows_decimal = ?");
      values.push(decimalAllowed);
    }

    const whereParts = [];
    const whereValues = [];

    if (columns.has("unit_code")) {
      whereParts.push("unit_code = ?");
      whereValues.push(unitCode);
    }

    if (columns.has("code")) {
      whereParts.push("code = ?");
      whereValues.push(unitCode);
    }

    const [existingRows] = await connection.query(
      `SELECT 1 FROM unit_master
       WHERE ${whereParts.join(" OR ")}
       LIMIT 1`,
      whereValues
    );

    if (existingRows.length > 0) {
      await connection.query(
        `UPDATE unit_master
         SET ${assignments.join(", ")}
         WHERE ${whereParts.join(" OR ")}`,
        [...values, ...whereValues]
      );
      continue;
    }

    const insertColumns = [];
    const insertValues = [];

    if (columns.has("unit_code")) {
      insertColumns.push("unit_code");
      insertValues.push(unitCode);
    }

    if (columns.has("unit_name")) {
      insertColumns.push("unit_name");
      insertValues.push(unitName);
    }

    if (columns.has("unit_type")) {
      insertColumns.push("unit_type");
      insertValues.push(unitType);
    }

    if (columns.has("decimal_allowed")) {
      insertColumns.push("decimal_allowed");
      insertValues.push(decimalAllowed);
    }

    if (columns.has("default_precision")) {
      insertColumns.push("default_precision");
      insertValues.push(defaultPrecision);
    }

    if (columns.has("is_active")) {
      insertColumns.push("is_active");
      insertValues.push(1);
    }

    if (columns.has("sort_order")) {
      insertColumns.push("sort_order");
      insertValues.push(sortOrder);
    }

    if (columns.has("code")) {
      insertColumns.push("code");
      insertValues.push(unitCode);
    }

    if (columns.has("name")) {
      insertColumns.push("name");
      insertValues.push(unitName);
    }

    if (columns.has("allows_decimal")) {
      insertColumns.push("allows_decimal");
      insertValues.push(decimalAllowed);
    }

    await connection.query(
      `INSERT INTO unit_master (${insertColumns.join(", ")})
       VALUES (${insertColumns.map(() => "?").join(", ")})`,
      insertValues
    );
  }
};

const createUnitTables = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS unit_master (
      unit_code VARCHAR(20) PRIMARY KEY,
      unit_name VARCHAR(100) NOT NULL,
      unit_type VARCHAR(40) NOT NULL DEFAULT 'count',
      decimal_allowed TINYINT(1) NOT NULL DEFAULT 0,
      default_precision TINYINT UNSIGNED NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_unit_master_active_sort (is_active, sort_order)
    )
  `);

  const unitMasterColumns = await ensureUnitMasterColumns(connection);
  await seedUnitMaster(connection, unitMasterColumns);

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

  await connection.query(
    `INSERT IGNORE INTO unit_conversions
       (shop_id, from_unit, to_unit, factor, description, is_active)
     VALUES ?`,
    [UNIT_CONVERSION_SEED.map((unit) => [0, ...unit, 1])]
  );
};

const ensureQuantityColumnTypes = async (connection) => {
  await connection.query("UPDATE products SET stock_quantity = 0 WHERE stock_quantity IS NULL");
  await connection.query("UPDATE products SET low_stock_limit = 0 WHERE low_stock_limit IS NULL");
  await connection.query(
    "ALTER TABLE products MODIFY COLUMN stock_quantity DECIMAL(14,4) NOT NULL DEFAULT 0"
  );
  await connection.query(
    "ALTER TABLE products MODIFY COLUMN low_stock_limit DECIMAL(14,4) NOT NULL DEFAULT 5"
  );

  const [saleItemTables] = await connection.query("SHOW TABLES LIKE 'sale_items'");
  if (saleItemTables.length > 0) {
    await connection.query(
      "ALTER TABLE sale_items MODIFY COLUMN quantity DECIMAL(14,4) NOT NULL"
    );
  }

  const [stockMovementTables] = await connection.query("SHOW TABLES LIKE 'stock_movements'");
  if (stockMovementTables.length > 0) {
    await connection.query(
      "ALTER TABLE stock_movements MODIFY COLUMN quantity DECIMAL(14,4) NOT NULL DEFAULT 0"
    );
    await connection.query(
      "ALTER TABLE stock_movements MODIFY COLUMN previous_stock DECIMAL(14,4) NOT NULL DEFAULT 0"
    );
    await connection.query(
      "ALTER TABLE stock_movements MODIFY COLUMN new_stock DECIMAL(14,4) NOT NULL DEFAULT 0"
    );
  }

  const [returnItemTables] = await connection.query("SHOW TABLES LIKE 'sales_return_items'");
  if (returnItemTables.length > 0) {
    await connection.query(
      "ALTER TABLE sales_return_items MODIFY COLUMN quantity DECIMAL(14,4) NOT NULL"
    );
  }
};

const ensureProductCatalogSchema = async () => {
  if (ensuredProductCatalogSchema) return;

  try {
    const connection = db.promise();

    await createUnitTables(connection);

    await connection.query(`
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

    const [columns] = await connection.query("SHOW COLUMNS FROM products");
    const existingColumns = new Set(columns.map((column) => column.Field));

    if (!hasColumn(existingColumns, "category_id")) {
      await connection.query("ALTER TABLE products ADD COLUMN category_id INT NULL AFTER category");
    }

    if (!hasColumn(existingColumns, "unit")) {
      await connection.query("ALTER TABLE products ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT 'PCS' AFTER category_id");
    }

    if (!hasColumn(existingColumns, "wholesale_price")) {
      await connection.query("ALTER TABLE products ADD COLUMN wholesale_price DECIMAL(10,2) NULL AFTER buying_price");
    }

    if (!hasColumn(existingColumns, "image_url")) {
      await connection.query("ALTER TABLE products ADD COLUMN image_url VARCHAR(500) NULL AFTER low_stock_limit");
    }

    const [updatedColumns] = await connection.query("SHOW COLUMNS FROM products");
    const productColumns = new Set(updatedColumns.map((column) => column.Field));

    if (!hasColumn(productColumns, "item_type")) {
      await connection.query(
        "ALTER TABLE products ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT 'product' AFTER image_url"
      );
    }

    if (!hasColumn(productColumns, "default_selling_unit")) {
      await connection.query(
        "ALTER TABLE products ADD COLUMN default_selling_unit VARCHAR(20) NOT NULL DEFAULT 'PCS' AFTER item_type"
      );
    }

    if (!hasColumn(productColumns, "default_purchase_unit")) {
      await connection.query(
        "ALTER TABLE products ADD COLUMN default_purchase_unit VARCHAR(20) NOT NULL DEFAULT 'PCS' AFTER default_selling_unit"
      );
    }

    if (!hasColumn(productColumns, "base_unit")) {
      await connection.query(
        "ALTER TABLE products ADD COLUMN base_unit VARCHAR(20) NOT NULL DEFAULT 'PCS' AFTER default_purchase_unit"
      );
    }

    if (!hasColumn(productColumns, "allow_decimal_qty")) {
      await connection.query(
        "ALTER TABLE products ADD COLUMN allow_decimal_qty TINYINT(1) NOT NULL DEFAULT 0 AFTER base_unit"
      );
    }

    if (!hasColumn(productColumns, "quantity_precision")) {
      await connection.query(
        "ALTER TABLE products ADD COLUMN quantity_precision TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER allow_decimal_qty"
      );
    }

    if (!hasColumn(productColumns, "tracking_method")) {
      await connection.query(
        "ALTER TABLE products ADD COLUMN tracking_method VARCHAR(30) NOT NULL DEFAULT 'SIMPLE_STOCK' AFTER quantity_precision"
      );
    }

    await ensureQuantityColumnTypes(connection);

    await connection.query(`
      INSERT IGNORE INTO product_categories (shop_id, name, is_active)
      SELECT DISTINCT shop_id, TRIM(category), 1
      FROM products
      WHERE category IS NOT NULL AND TRIM(category) <> ''
    `);

    await connection.query(`
      UPDATE products
      INNER JOIN product_categories
        ON product_categories.shop_id = products.shop_id
       AND LOWER(product_categories.name) = LOWER(TRIM(products.category))
      SET products.category_id = product_categories.id
      WHERE products.category_id IS NULL
        AND products.category IS NOT NULL
        AND TRIM(products.category) <> ''
    `);

    await connection.query(`
      UPDATE products
      SET wholesale_price = buying_price
      WHERE wholesale_price IS NULL
    `);

    await connection.query(`
      UPDATE products
      SET unit = CASE
          WHEN LOWER(TRIM(unit)) IN ('pcs', 'pc', 'piece', 'pieces') THEN 'PCS'
          WHEN LOWER(TRIM(unit)) IN ('packet', 'pack') THEN 'PACK'
          WHEN LOWER(TRIM(unit)) = 'box' THEN 'BOX'
          WHEN LOWER(TRIM(unit)) = 'carton' THEN 'CARTON'
          WHEN LOWER(TRIM(unit)) = 'dozen' THEN 'DOZEN'
          WHEN LOWER(TRIM(unit)) = 'pair' THEN 'PAIR'
          WHEN LOWER(TRIM(unit)) = 'set' THEN 'SET'
          WHEN LOWER(TRIM(unit)) = 'bundle' THEN 'BUNDLE'
          WHEN LOWER(TRIM(unit)) = 'roll' THEN 'ROLL'
          WHEN LOWER(TRIM(unit)) = 'bag' THEN 'BAG'
          WHEN LOWER(TRIM(unit)) = 'bottle' THEN 'BOTTLE'
          WHEN LOWER(TRIM(unit)) = 'can' THEN 'CAN'
          WHEN LOWER(TRIM(unit)) = 'sachet' THEN 'SACHET'
          WHEN LOWER(TRIM(unit)) = 'kg' THEN 'KG'
          WHEN LOWER(TRIM(unit)) IN ('g', 'gram', 'grams') THEN 'G'
          WHEN LOWER(TRIM(unit)) IN ('l', 'litre', 'liter') THEN 'L'
          WHEN LOWER(TRIM(unit)) = 'ml' THEN 'ML'
          WHEN LOWER(TRIM(unit)) IN ('m', 'metre', 'meter') THEN 'M'
          WHEN LOWER(TRIM(unit)) = 'cm' THEN 'CM'
          WHEN LOWER(TRIM(unit)) IN ('ft', 'feet') THEN 'FT'
          WHEN LOWER(TRIM(unit)) IN ('in', 'inch') THEN 'IN'
          WHEN LOWER(TRIM(unit)) = 'sqft' THEN 'SQFT'
          WHEN LOWER(TRIM(unit)) = 'sqm' THEN 'SQM'
          WHEN LOWER(TRIM(unit)) = 'sheet' THEN 'SHEET'
          WHEN LOWER(TRIM(unit)) = 'bar' THEN 'BAR'
          WHEN LOWER(TRIM(unit)) = 'coil' THEN 'COIL'
          WHEN LOWER(TRIM(unit)) = 'service' THEN 'SERVICE'
          WHEN LOWER(TRIM(unit)) = 'hour' THEN 'HOUR'
          WHEN LOWER(TRIM(unit)) = 'job' THEN 'JOB'
          ELSE 'PCS'
        END
      WHERE unit IS NULL
         OR TRIM(unit) = ''
         OR UPPER(TRIM(unit)) NOT IN (
           'PCS', 'PACK', 'BOX', 'CARTON', 'DOZEN', 'PAIR', 'SET', 'BUNDLE',
           'ROLL', 'BAG', 'BOTTLE', 'CAN', 'SACHET', 'KG', 'G', 'L', 'ML',
           'M', 'CM', 'FT', 'IN', 'SQFT', 'SQM', 'SHEET', 'BAR', 'COIL',
           'SERVICE', 'HOUR', 'JOB'
         )
         OR BINARY unit <> UPPER(TRIM(unit))
    `);

    await connection.query(`
      UPDATE products
      SET item_type = 'product'
      WHERE item_type IS NULL
         OR item_type NOT IN ('product', 'service', 'bundle', 'non_stock')
    `);

    await connection.query(`
      UPDATE products
      SET default_selling_unit = CASE
          WHEN default_selling_unit IS NULL
            OR TRIM(default_selling_unit) = ''
            OR (default_selling_unit = 'PCS' AND unit <> 'PCS')
            THEN unit
          ELSE UPPER(TRIM(default_selling_unit))
        END,
        default_purchase_unit = CASE
          WHEN default_purchase_unit IS NULL
            OR TRIM(default_purchase_unit) = ''
            OR (default_purchase_unit = 'PCS' AND unit <> 'PCS')
            THEN unit
          ELSE UPPER(TRIM(default_purchase_unit))
        END,
        base_unit = CASE
          WHEN base_unit IS NULL
            OR TRIM(base_unit) = ''
            OR (base_unit = 'PCS' AND unit <> 'PCS')
            THEN unit
          ELSE UPPER(TRIM(base_unit))
        END
    `);

    await connection.query(`
      UPDATE products
      LEFT JOIN unit_master AS selling_units
        ON selling_units.unit_code = products.default_selling_unit
      LEFT JOIN unit_master AS purchase_units
        ON purchase_units.unit_code = products.default_purchase_unit
      LEFT JOIN unit_master AS base_units
        ON base_units.unit_code = products.base_unit
      SET products.default_selling_unit = COALESCE(selling_units.unit_code, products.unit, 'PCS'),
          products.default_purchase_unit = COALESCE(purchase_units.unit_code, products.default_selling_unit, products.unit, 'PCS'),
          products.base_unit = COALESCE(base_units.unit_code, products.default_selling_unit, products.unit, 'PCS')
    `);

    await connection.query(`
      UPDATE products
      INNER JOIN unit_master ON unit_master.unit_code = products.default_selling_unit
      SET products.allow_decimal_qty = CASE
            WHEN unit_master.decimal_allowed = 1 THEN 1
            ELSE COALESCE(products.allow_decimal_qty, 0)
          END,
          products.quantity_precision = CASE
            WHEN unit_master.decimal_allowed = 1
              THEN GREATEST(products.quantity_precision, unit_master.default_precision)
            ELSE 0
          END
    `);

    await connection.query(`
      UPDATE products
      SET tracking_method = CASE
          WHEN item_type = 'service' THEN 'SERVICE_ONLY'
          WHEN tracking_method IS NULL
            OR tracking_method NOT IN (
              'SIMPLE_STOCK', 'VARIANT_STOCK', 'BATCH_STOCK', 'SERIAL_STOCK',
              'WEIGHT_STOCK', 'LENGTH_STOCK', 'AREA_STOCK', 'SERVICE_ONLY',
              'BUNDLE_KIT'
            )
            THEN 'SIMPLE_STOCK'
          ELSE tracking_method
        END
    `);

    ensuredProductCatalogSchema = true;
  } catch (error) {
    console.error(
      "Product catalog schema setup failed. Ensure product catalog and unit foundation migrations are applied.",
      error.message
    );
    throw error;
  }
};

module.exports = {
  DECIMAL_UNIT_CODES,
  ITEM_TYPES,
  TRACKING_METHODS,
  UNIT_MASTER_SEED,
  getUnitDefaults,
  getUnitMasterSeed,
  normalizeUnitCode,
  ensureProductCatalogSchema,
};
