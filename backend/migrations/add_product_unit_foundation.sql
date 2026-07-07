CREATE TABLE IF NOT EXISTS unit_master (
  unit_code VARCHAR(20) PRIMARY KEY,
  unit_name VARCHAR(100) NOT NULL,
  unit_type VARCHAR(40) NOT NULL DEFAULT 'count',
  decimal_allowed TINYINT(1) NOT NULL DEFAULT 0,
  default_precision TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  code VARCHAR(20) NULL,
  name VARCHAR(100) NULL,
  allows_decimal TINYINT(1) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_unit_master_active_sort (is_active, sort_order)
);

ALTER TABLE unit_master
  ADD COLUMN IF NOT EXISTS unit_code VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS unit_name VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS unit_type VARCHAR(40) NOT NULL DEFAULT 'count',
  ADD COLUMN IF NOT EXISTS decimal_allowed TINYINT(1) NULL,
  ADD COLUMN IF NOT EXISTS default_precision TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS code VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS name VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS allows_decimal TINYINT(1) NULL;

SET @has_legacy_code := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'unit_master'
    AND column_name = 'code'
);
SET @sql := IF(
  @has_legacy_code > 0,
  'UPDATE unit_master SET unit_code = UPPER(TRIM(code)) WHERE (unit_code IS NULL OR TRIM(unit_code) = '''') AND code IS NOT NULL AND TRIM(code) <> ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_legacy_name := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'unit_master'
    AND column_name = 'name'
);
SET @sql := IF(
  @has_legacy_name > 0,
  'UPDATE unit_master SET unit_name = name WHERE (unit_name IS NULL OR TRIM(unit_name) = '''') AND name IS NOT NULL AND TRIM(name) <> ''''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_legacy_decimal := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'unit_master'
    AND column_name = 'allows_decimal'
);
SET @sql := IF(
  @has_legacy_decimal > 0,
  'UPDATE unit_master SET decimal_allowed = allows_decimal WHERE decimal_allowed IS NULL AND allows_decimal IS NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO unit_master
  (unit_code, unit_name, unit_type, decimal_allowed, default_precision, is_active, sort_order,
   code, name, allows_decimal)
VALUES
  ('PCS', 'Pieces', 'count', 0, 0, 1, 10, 'PCS', 'Pieces', 0),
  ('PACK', 'Pack', 'count', 0, 0, 1, 20, 'PACK', 'Pack', 0),
  ('BOX', 'Box', 'count', 0, 0, 1, 30, 'BOX', 'Box', 0),
  ('CARTON', 'Carton', 'count', 0, 0, 1, 40, 'CARTON', 'Carton', 0),
  ('DOZEN', 'Dozen', 'count', 0, 0, 1, 50, 'DOZEN', 'Dozen', 0),
  ('PAIR', 'Pair', 'count', 0, 0, 1, 60, 'PAIR', 'Pair', 0),
  ('SET', 'Set', 'count', 0, 0, 1, 70, 'SET', 'Set', 0),
  ('BUNDLE', 'Bundle', 'count', 0, 0, 1, 80, 'BUNDLE', 'Bundle', 0),
  ('ROLL', 'Roll', 'count', 0, 0, 1, 90, 'ROLL', 'Roll', 0),
  ('BAG', 'Bag', 'count', 0, 0, 1, 100, 'BAG', 'Bag', 0),
  ('BOTTLE', 'Bottle', 'count', 0, 0, 1, 110, 'BOTTLE', 'Bottle', 0),
  ('CAN', 'Can', 'count', 0, 0, 1, 120, 'CAN', 'Can', 0),
  ('SACHET', 'Sachet', 'count', 0, 0, 1, 130, 'SACHET', 'Sachet', 0),
  ('KG', 'Kilogram', 'weight', 1, 3, 1, 200, 'KG', 'Kilogram', 1),
  ('G', 'Gram', 'weight', 1, 2, 1, 210, 'G', 'Gram', 1),
  ('L', 'Litre', 'volume', 1, 3, 1, 300, 'L', 'Litre', 1),
  ('ML', 'Millilitre', 'volume', 1, 2, 1, 310, 'ML', 'Millilitre', 1),
  ('M', 'Metre', 'length', 1, 3, 1, 400, 'M', 'Metre', 1),
  ('CM', 'Centimetre', 'length', 1, 2, 1, 410, 'CM', 'Centimetre', 1),
  ('FT', 'Feet', 'length', 1, 2, 1, 420, 'FT', 'Feet', 1),
  ('IN', 'Inch', 'length', 1, 2, 1, 430, 'IN', 'Inch', 1),
  ('SQFT', 'Square feet', 'area', 1, 2, 1, 500, 'SQFT', 'Square feet', 1),
  ('SQM', 'Square metre', 'area', 1, 3, 1, 510, 'SQM', 'Square metre', 1),
  ('SHEET', 'Sheet', 'count', 0, 0, 1, 600, 'SHEET', 'Sheet', 0),
  ('BAR', 'Bar', 'count', 0, 0, 1, 610, 'BAR', 'Bar', 0),
  ('COIL', 'Coil', 'count', 0, 0, 1, 620, 'COIL', 'Coil', 0),
  ('SERVICE', 'Service', 'service', 0, 0, 1, 700, 'SERVICE', 'Service', 0),
  ('HOUR', 'Hour', 'time', 1, 2, 1, 710, 'HOUR', 'Hour', 1),
  ('JOB', 'Job', 'service', 0, 0, 1, 720, 'JOB', 'Job', 0)
ON DUPLICATE KEY UPDATE
  unit_name = VALUES(unit_name),
  unit_type = VALUES(unit_type),
  decimal_allowed = VALUES(decimal_allowed),
  default_precision = VALUES(default_precision),
  is_active = VALUES(is_active),
  sort_order = VALUES(sort_order),
  code = VALUES(code),
  name = VALUES(name),
  allows_decimal = VALUES(allows_decimal);

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
);

INSERT IGNORE INTO unit_conversions
  (shop_id, from_unit, to_unit, factor, description, is_active)
VALUES
  (0, 'KG', 'G', 1000, '1 KG = 1000 G', 1),
  (0, 'G', 'KG', 0.001, '1 G = 0.001 KG', 1),
  (0, 'L', 'ML', 1000, '1 L = 1000 ML', 1),
  (0, 'ML', 'L', 0.001, '1 ML = 0.001 L', 1),
  (0, 'M', 'CM', 100, '1 M = 100 CM', 1),
  (0, 'CM', 'M', 0.01, '1 CM = 0.01 M', 1),
  (0, 'FT', 'IN', 12, '1 FT = 12 IN', 1),
  (0, 'IN', 'FT', 0.083333, '1 IN = 0.083333 FT', 1);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'product' AFTER image_url,
  ADD COLUMN IF NOT EXISTS default_selling_unit VARCHAR(20) NOT NULL DEFAULT 'PCS' AFTER item_type,
  ADD COLUMN IF NOT EXISTS default_purchase_unit VARCHAR(20) NOT NULL DEFAULT 'PCS' AFTER default_selling_unit,
  ADD COLUMN IF NOT EXISTS base_unit VARCHAR(20) NOT NULL DEFAULT 'PCS' AFTER default_purchase_unit,
  ADD COLUMN IF NOT EXISTS allow_decimal_qty TINYINT(1) NOT NULL DEFAULT 0 AFTER base_unit,
  ADD COLUMN IF NOT EXISTS quantity_precision TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER allow_decimal_qty,
  ADD COLUMN IF NOT EXISTS tracking_method VARCHAR(30) NOT NULL DEFAULT 'SIMPLE_STOCK' AFTER quantity_precision;

ALTER TABLE products
  MODIFY COLUMN stock_quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
  MODIFY COLUMN low_stock_limit DECIMAL(14,4) NOT NULL DEFAULT 5;

ALTER TABLE sale_items
  MODIFY COLUMN quantity DECIMAL(14,4) NOT NULL;

ALTER TABLE stock_movements
  MODIFY COLUMN quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
  MODIFY COLUMN previous_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
  MODIFY COLUMN new_stock DECIMAL(14,4) NOT NULL DEFAULT 0;

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
    WHEN LOWER(TRIM(unit)) = 'ft' THEN 'FT'
    WHEN LOWER(TRIM(unit)) IN ('in', 'inch') THEN 'IN'
    WHEN LOWER(TRIM(unit)) = 'sqft' THEN 'SQFT'
    WHEN LOWER(TRIM(unit)) = 'sqm' THEN 'SQM'
    WHEN LOWER(TRIM(unit)) = 'sheet' THEN 'SHEET'
    WHEN LOWER(TRIM(unit)) = 'bar' THEN 'BAR'
    WHEN LOWER(TRIM(unit)) = 'coil' THEN 'COIL'
    WHEN LOWER(TRIM(unit)) = 'hour' THEN 'HOUR'
    WHEN LOWER(TRIM(unit)) = 'job' THEN 'JOB'
    WHEN LOWER(TRIM(unit)) = 'service' THEN 'SERVICE'
    ELSE 'PCS'
  END
WHERE unit IS NULL
   OR TRIM(unit) = ''
   OR BINARY unit <> UPPER(TRIM(unit));

UPDATE products
SET item_type = 'product'
WHERE item_type IS NULL
   OR item_type NOT IN ('product', 'service', 'bundle', 'non_stock');

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
    END;

UPDATE products
INNER JOIN unit_master
  ON unit_master.unit_code = products.default_selling_unit
SET products.allow_decimal_qty = CASE
      WHEN unit_master.decimal_allowed = 1 THEN 1
      ELSE COALESCE(products.allow_decimal_qty, 0)
    END,
    products.quantity_precision = CASE
      WHEN unit_master.decimal_allowed = 1
        THEN GREATEST(products.quantity_precision, unit_master.default_precision)
      ELSE 0
    END;

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
  END;
