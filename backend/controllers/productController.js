const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");
const {
  ITEM_TYPES,
  TRACKING_METHODS,
  getUnitDefaults,
  normalizeUnitCode,
  ensureProductCatalogSchema,
} = require("../utils/productCatalogSchema");

const productSelect = `
  products.id,
  products.shop_id,
  products.product_name,
  products.product_code,
  products.barcode,
  products.category_id,
  COALESCE(categories.name, products.category) AS category,
  products.unit,
  products.item_type,
  products.default_selling_unit,
  products.default_purchase_unit,
  products.base_unit,
  products.allow_decimal_qty,
  products.quantity_precision,
  products.tracking_method,
  products.buying_price,
  COALESCE(products.wholesale_price, products.buying_price) AS wholesale_price,
  products.selling_price,
  products.stock_quantity,
  products.low_stock_limit,
  products.image_url
`;

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const isMissing = (value) =>
  value === undefined || value === null || String(value).trim() === "";

const isNonNegativeNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) >= 0;

const isNonNegativeInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) >= 0;

const isNonNegativeQuantity = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) >= 0;

const hasDecimalPart = (value) => Math.abs(Number(value) % 1) > Number.EPSILON;

const getDecimalPlaces = (value) => {
  const text = String(value);

  if (!text.includes(".")) return 0;

  return text.split(".")[1].replace(/0+$/, "").length;
};

const normalizeUnitBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue ? 1 : 0;
  }

  if (value === true || value === 1 || value === "1" || value === "true") {
    return 1;
  }

  return 0;
};

const normalizeItemType = (value) => {
  const normalized = String(value || "product").trim().toLowerCase();
  return ITEM_TYPES.includes(normalized) ? normalized : null;
};

const normalizeTrackingMethod = (value, itemType = "product") => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return itemType === "service" ? "SERVICE_ONLY" : "SIMPLE_STOCK";
  }

  const normalized = String(value).trim().toUpperCase();
  return TRACKING_METHODS.includes(normalized) ? normalized : null;
};

const validateQuantityByPrecision = ({
  value,
  fieldName,
  allowDecimalQty,
  quantityPrecision,
  errors,
}) => {
  if (value === undefined || value === null || value === "") return;

  if (!isNonNegativeQuantity(value)) {
    errors.push(`${fieldName} must be a non-negative number`);
    return;
  }

  if (!allowDecimalQty && hasDecimalPart(value)) {
    errors.push(`${fieldName} must be a whole number`);
    return;
  }

  if (getDecimalPlaces(value) > quantityPrecision) {
    errors.push(`${fieldName} cannot have more than ${quantityPrecision} decimal places`);
  }
};

const normalizeBoolean = (value, defaultValue = true) => {
  if (value === undefined) return defaultValue ? 1 : 0;
  if (value === false || value === 0 || value === "0" || value === "false") return 0;
  return 1;
};

const validateProduct = async (body) => {
  const errors = [];
  const costPrice = body.wholesale_price ?? body.buying_price;
  const itemType = normalizeItemType(body.item_type);
  const trackingMethod = normalizeTrackingMethod(body.tracking_method, itemType || "product");
  const requestedSellingUnit =
    body.default_selling_unit || body.selling_unit || body.unit || "PCS";
  const defaultSellingUnit = normalizeUnitCode(requestedSellingUnit);
  const unitDefaults = getUnitDefaults(defaultSellingUnit);
  const allowDecimalQty =
    unitDefaults.allow_decimal_qty === 1 ||
    normalizeUnitBoolean(body.allow_decimal_qty, unitDefaults.allow_decimal_qty === 1) === 1;
  const quantityPrecision =
    body.quantity_precision === undefined ||
    body.quantity_precision === null ||
    body.quantity_precision === ""
      ? unitDefaults.quantity_precision
      : Number(body.quantity_precision);

  if (isMissing(body.product_name)) {
    errors.push("product_name is required");
  }

  if (!isNonNegativeNumber(costPrice)) {
    errors.push("wholesale_price is required and must be a non-negative number");
  }

  if (!isNonNegativeNumber(body.selling_price)) {
    errors.push("selling_price is required and must be a non-negative number");
  }

  if (!itemType) {
    errors.push(`item_type must be one of ${ITEM_TYPES.join(", ")}`);
  }

  if (!trackingMethod) {
    errors.push(`tracking_method must be one of ${TRACKING_METHODS.join(", ")}`);
  }

  if (!Number.isInteger(quantityPrecision) || quantityPrecision < 0 || quantityPrecision > 4) {
    errors.push("quantity_precision must be an integer from 0 to 4");
  }

  validateQuantityByPrecision({
    value: body.stock_quantity,
    fieldName: "stock_quantity",
    allowDecimalQty,
    quantityPrecision: Number.isInteger(quantityPrecision) ? quantityPrecision : 0,
    errors,
  });

  validateQuantityByPrecision({
    value: body.low_stock_limit,
    fieldName: "low_stock_limit",
    allowDecimalQty,
    quantityPrecision: Number.isInteger(quantityPrecision) ? quantityPrecision : 0,
    errors,
  });

  if (
    body.low_stock_limit !== undefined &&
    body.low_stock_limit !== "" &&
    body.low_stock_limit !== null &&
    !isNonNegativeQuantity(body.low_stock_limit)
  ) {
    errors.push("low_stock_limit must be a non-negative number");
  }

  const unitCodes = [
    requestedSellingUnit,
    body.default_purchase_unit,
    body.purchase_unit,
    body.base_unit,
  ].filter((unit) => unit !== undefined && unit !== null && String(unit).trim() !== "");
  const normalizedUnitCodes = unitCodes
    .map((unit) => normalizeUnitCode(unit, null))
    .filter(Boolean);
  const [unitRows] = await db
    .promise()
    .query("SELECT unit_code AS code FROM unit_master WHERE is_active = 1 AND unit_code IN (?)", [
      normalizedUnitCodes.length > 0 ? normalizedUnitCodes : ["__none__"],
    ]);
  const validUnitCodes = new Set(unitRows.map((unit) => unit.code));

  for (const unit of unitCodes) {
    const normalizedUnit = normalizeUnitCode(unit, null);
    if (!validUnitCodes.has(normalizedUnit)) {
      errors.push(`${unit} is not an active unit`);
    }
  }

  return errors;
};

const buildProductFoundation = (body) => {
  const itemType = normalizeItemType(body.item_type) || "product";
  const defaultSellingUnit = normalizeUnitCode(
    body.default_selling_unit || body.selling_unit || body.unit || "PCS"
  );
  const defaultPurchaseUnit = normalizeUnitCode(
    body.default_purchase_unit || body.purchase_unit || defaultSellingUnit
  );
  const baseUnit = normalizeUnitCode(body.base_unit || defaultSellingUnit);
  const unitDefaults = getUnitDefaults(defaultSellingUnit);
  const allowDecimalQty =
    unitDefaults.allow_decimal_qty === 1 ||
    normalizeUnitBoolean(body.allow_decimal_qty, unitDefaults.allow_decimal_qty === 1) === 1;
  const requestedPrecision =
    body.quantity_precision === undefined ||
    body.quantity_precision === null ||
    body.quantity_precision === ""
      ? unitDefaults.quantity_precision
      : Number(body.quantity_precision);
  const quantityPrecision = allowDecimalQty ? requestedPrecision : 0;
  const defaultTrackingMethod =
    itemType === "service" || itemType === "non_stock"
      ? "SERVICE_ONLY"
      : "SIMPLE_STOCK";
  const trackingMethod =
    normalizeTrackingMethod(body.tracking_method, itemType) || defaultTrackingMethod;

  return {
    itemType,
    defaultSellingUnit,
    defaultPurchaseUnit,
    baseUnit,
    allowDecimalQty: allowDecimalQty ? 1 : 0,
    quantityPrecision,
    trackingMethod:
      itemType === "service" || itemType === "non_stock"
        ? "SERVICE_ONLY"
        : trackingMethod,
  };
};

const checkDuplicateCodes = async ({ shopId, productCode, barcode, excludeId }) => {
  const conditions = [];
  const values = [shopId];
  const normalizedProductCode = productCode ? productCode.toLowerCase() : null;
  const normalizedBarcode = barcode ? barcode.toLowerCase() : null;

  if (normalizedProductCode) {
    conditions.push("LOWER(TRIM(product_code)) = ?");
    values.push(normalizedProductCode);
  }

  if (normalizedBarcode) {
    conditions.push("LOWER(TRIM(barcode)) = ?");
    values.push(normalizedBarcode);
  }

  if (conditions.length === 0) {
    return null;
  }

  let sql = `SELECT id, product_code, barcode FROM products WHERE shop_id = ? AND (${conditions.join(
    " OR "
  )})`;

  if (excludeId) {
    sql += " AND id <> ?";
    values.push(excludeId);
  }

  sql += " LIMIT 1";

  const [products] = await db.promise().query(sql, values);

  if (products.length === 0) {
    return null;
  }

  const duplicate = products[0];
  const duplicateProductCode = duplicate.product_code
    ? String(duplicate.product_code).trim().toLowerCase()
    : null;
  const duplicateBarcode = duplicate.barcode
    ? String(duplicate.barcode).trim().toLowerCase()
    : null;

  if (normalizedProductCode && duplicateProductCode === normalizedProductCode) {
    return "Product code already exists in this shop";
  }

  if (normalizedBarcode && duplicateBarcode === normalizedBarcode) {
    return "Barcode already exists in this shop";
  }

  return "Product code or barcode already exists in this shop";
};

const getDefaultLowStockLimit = async (shopId) => {
  const [shops] = await db.promise().query(
    "SELECT default_low_stock_limit FROM shops WHERE id = ? LIMIT 1",
    [shopId]
  );

  return Number(shops[0]?.default_low_stock_limit || 5);
};

const resolveCategory = async ({ shopId, categoryId, categoryName }) => {
  if (categoryId !== undefined && categoryId !== null && categoryId !== "") {
    if (!isNonNegativeInteger(categoryId) || Number(categoryId) === 0) {
      const error = new Error("Valid category_id is required");
      error.statusCode = 400;
      throw error;
    }

    const [categories] = await db.promise().query(
      "SELECT id, name FROM product_categories WHERE id = ? AND shop_id = ? LIMIT 1",
      [categoryId, shopId]
    );

    if (categories.length === 0) {
      const error = new Error("Category not found");
      error.statusCode = 404;
      throw error;
    }

    return { id: categories[0].id, name: categories[0].name };
  }

  const normalizedCategory = normalizeOptionalText(categoryName);

  if (!normalizedCategory) {
    return { id: null, name: null };
  }

  await db.promise().query(
    `INSERT INTO product_categories (shop_id, name, is_active)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
    [shopId, normalizedCategory]
  );

  const [categories] = await db.promise().query(
    "SELECT id, name FROM product_categories WHERE shop_id = ? AND name = ? LIMIT 1",
    [shopId, normalizedCategory]
  );

  return { id: categories[0]?.id || null, name: categories[0]?.name || normalizedCategory };
};

exports.getCategories = async (req, res) => {
  try {
    await ensureProductCatalogSchema();

    const [categories] = await db.promise().query(
      `SELECT id, shop_id, name, description, is_active, created_at
       FROM product_categories
       WHERE shop_id = ?
       ORDER BY is_active DESC, name ASC`,
      [req.user.shop_id]
    );

    return res.json({ categories });
  } catch (error) {
    console.error("Get categories error:", error.message);
    return res.status(500).json({
      message: "Failed to get categories",
      error: error.message,
    });
  }
};

exports.addCategory = async (req, res) => {
  const name = normalizeOptionalText(req.body.name);
  const description = normalizeOptionalText(req.body.description);
  const isActive = normalizeBoolean(req.body.is_active);

  if (!name) {
    return res.status(400).json({ message: "Category name is required" });
  }

  try {
    await ensureProductCatalogSchema();

    const [result] = await db.promise().query(
      `INSERT INTO product_categories (shop_id, name, description, is_active)
       VALUES (?, ?, ?, ?)`,
      [req.user.shop_id, name, description, isActive]
    );

    await createAuditLogFromRequest(req, {
      action: "category_add",
      entity_type: "product_category",
      entity_id: result.insertId,
      description: `Added category ${name}`,
    });

    return res.status(201).json({
      message: "Category added successfully",
      category_id: result.insertId,
    });
  } catch (error) {
    const isDuplicate = error.code === "ER_DUP_ENTRY";
    console.error("Add category error:", error.message);
    return res.status(isDuplicate ? 409 : 500).json({
      message: isDuplicate ? "Category already exists" : "Failed to add category",
      error: error.message,
    });
  }
};

exports.updateCategory = async (req, res) => {
  const categoryId = req.params.id;
  const name = normalizeOptionalText(req.body.name);
  const description = normalizeOptionalText(req.body.description);
  const isActive = normalizeBoolean(req.body.is_active);

  if (!isNonNegativeInteger(categoryId) || Number(categoryId) === 0) {
    return res.status(400).json({ message: "Valid category id is required" });
  }

  if (!name) {
    return res.status(400).json({ message: "Category name is required" });
  }

  try {
    await ensureProductCatalogSchema();

    const [result] = await db.promise().query(
      `UPDATE product_categories
       SET name = ?, description = ?, is_active = ?
       WHERE id = ? AND shop_id = ?`,
      [name, description, isActive, categoryId, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    await db.promise().query(
      "UPDATE products SET category = ? WHERE shop_id = ? AND category_id = ?",
      [name, req.user.shop_id, categoryId]
    );

    await createAuditLogFromRequest(req, {
      action: "category_update",
      entity_type: "product_category",
      entity_id: Number(categoryId),
      description: `Updated category ${name}`,
    });

    return res.json({ message: "Category updated successfully" });
  } catch (error) {
    const isDuplicate = error.code === "ER_DUP_ENTRY";
    console.error("Update category error:", error.message);
    return res.status(isDuplicate ? 409 : 500).json({
      message: isDuplicate ? "Category already exists" : "Failed to update category",
      error: error.message,
    });
  }
};

exports.deleteCategory = async (req, res) => {
  const categoryId = req.params.id;

  if (!isNonNegativeInteger(categoryId) || Number(categoryId) === 0) {
    return res.status(400).json({ message: "Valid category id is required" });
  }

  try {
    await ensureProductCatalogSchema();

    const [categories] = await db.promise().query(
      "SELECT name FROM product_categories WHERE id = ? AND shop_id = ? LIMIT 1",
      [categoryId, req.user.shop_id]
    );

    await db.promise().query(
      "UPDATE products SET category_id = NULL, category = NULL WHERE shop_id = ? AND category_id = ?",
      [req.user.shop_id, categoryId]
    );

    const [result] = await db.promise().query(
      "DELETE FROM product_categories WHERE id = ? AND shop_id = ?",
      [categoryId, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    await createAuditLogFromRequest(req, {
      action: "category_delete",
      entity_type: "product_category",
      entity_id: Number(categoryId),
      description: `Deleted category ${categories[0]?.name || categoryId}`,
    });

    return res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Delete category error:", error.message);
    return res.status(500).json({
      message: "Failed to delete category",
      error: error.message,
    });
  }
};

exports.addProduct = async (req, res) => {
  const {
    product_name,
    product_code,
    barcode,
    category,
    category_id,
    buying_price,
    wholesale_price,
    selling_price,
    stock_quantity,
    low_stock_limit,
    image_url,
  } = req.body;
  const shopId = req.user.shop_id;
  const normalizedProductName = String(product_name || "").trim();
  const normalizedProductCode = normalizeOptionalText(product_code);
  const normalizedBarcode = normalizeOptionalText(barcode);
  const normalizedImageUrl = normalizeOptionalText(image_url);
  const costPrice = Number(wholesale_price ?? buying_price);

  try {
    await ensureProductCatalogSchema();

    const errors = await validateProduct(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const foundation = buildProductFoundation(req.body);

    const duplicateMessage = await checkDuplicateCodes({
      shopId,
      productCode: normalizedProductCode,
      barcode: normalizedBarcode,
    });

    if (duplicateMessage) {
      return res.status(409).json({ message: duplicateMessage });
    }

    const defaultLowStockLimit = await getDefaultLowStockLimit(shopId);
    const lowStockLimit =
      low_stock_limit === undefined || low_stock_limit === null || low_stock_limit === ""
        ? defaultLowStockLimit
        : Number(low_stock_limit);
    const resolvedCategory = await resolveCategory({
      shopId,
      categoryId: category_id,
      categoryName: category,
    });

    const [result] = await db.promise().query(
      `INSERT INTO products
       (shop_id, product_name, product_code, barcode, category, category_id, unit,
        buying_price, wholesale_price, selling_price, stock_quantity, low_stock_limit, image_url,
        item_type, default_selling_unit, default_purchase_unit, base_unit,
        allow_decimal_qty, quantity_precision, tracking_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        normalizedProductName,
        normalizedProductCode,
        normalizedBarcode,
        resolvedCategory.name,
        resolvedCategory.id,
        foundation.defaultSellingUnit,
        costPrice,
        costPrice,
        Number(selling_price),
        stock_quantity === undefined ? 0 : Number(stock_quantity),
        lowStockLimit,
        normalizedImageUrl,
        foundation.itemType,
        foundation.defaultSellingUnit,
        foundation.defaultPurchaseUnit,
        foundation.baseUnit,
        foundation.allowDecimalQty,
        foundation.quantityPrecision,
        foundation.trackingMethod,
      ]
    );

    await createAuditLogFromRequest(req, {
      action: "product_add",
      entity_type: "product",
      entity_id: result.insertId,
      description: `Added product ${normalizedProductName}`,
    });

    return res.status(201).json({
      message: "Product added successfully",
      product_id: result.insertId,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Add product error:", error.message);
    return res.status(500).json({
      message: "Failed to add product",
      error: error.message,
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    await ensureProductCatalogSchema();

    const [products] = await db.promise().query(
      `SELECT ${productSelect}
       FROM products
       LEFT JOIN product_categories AS categories
         ON categories.id = products.category_id
        AND categories.shop_id = products.shop_id
       WHERE products.shop_id = ?
       ORDER BY products.id DESC`,
      [req.user.shop_id]
    );

    return res.json(products);
  } catch (error) {
    console.error("Get products error:", error.message);
    return res.status(500).json({
      message: "Failed to get products",
      error: error.message,
    });
  }
};

exports.getProductByCode = async (req, res) => {
  const code = normalizeOptionalText(req.params.code);

  if (!code) {
    return res.status(400).json({ message: "Product code or barcode is required" });
  }

  try {
    await ensureProductCatalogSchema();

    const normalizedCode = code.toLowerCase();
    const [products] = await db.promise().query(
      `SELECT ${productSelect}
       FROM products
       LEFT JOIN product_categories AS categories
         ON categories.id = products.category_id
        AND categories.shop_id = products.shop_id
       WHERE products.shop_id = ?
         AND (
           products.product_code = ?
           OR products.barcode = ?
           OR LOWER(products.product_code) = ?
           OR LOWER(products.barcode) = ?
         )
       LIMIT 1`,
      [req.user.shop_id, code, code, normalizedCode, normalizedCode]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json(products[0]);
  } catch (error) {
    console.error("Search product by code error:", error.message);
    return res.status(500).json({
      message: "Failed to search product",
      error: error.message,
    });
  }
};

exports.getLowStockProducts = async (req, res) => {
  try {
    await ensureProductCatalogSchema();

    const [products] = await db.promise().query(
      `SELECT ${productSelect}
       FROM products
       LEFT JOIN product_categories AS categories
         ON categories.id = products.category_id
        AND categories.shop_id = products.shop_id
       WHERE products.shop_id = ? AND stock_quantity <= low_stock_limit
       ORDER BY stock_quantity ASC`,
      [req.user.shop_id]
    );

    return res.json(products);
  } catch (error) {
    console.error("Get low stock products error:", error.message);
    return res.status(500).json({
      message: "Failed to get low stock products",
      error: error.message,
    });
  }
};

exports.updateProduct = async (req, res) => {
  const productId = req.params.id;
  const {
    product_name,
    product_code,
    barcode,
    category,
    category_id,
    buying_price,
    wholesale_price,
    selling_price,
    stock_quantity,
    low_stock_limit,
    image_url,
  } = req.body;
  const shopId = req.user.shop_id;
  const normalizedProductName = String(product_name || "").trim();
  const normalizedProductCode = normalizeOptionalText(product_code);
  const normalizedBarcode = normalizeOptionalText(barcode);
  const normalizedImageUrl = normalizeOptionalText(image_url);
  const costPrice = Number(wholesale_price ?? buying_price);

  if (!isNonNegativeInteger(productId) || Number(productId) === 0) {
    return res.status(400).json({ message: "Valid product id is required" });
  }

  try {
    await ensureProductCatalogSchema();

    const errors = await validateProduct(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const foundation = buildProductFoundation(req.body);

    const duplicateMessage = await checkDuplicateCodes({
      shopId,
      productCode: normalizedProductCode,
      barcode: normalizedBarcode,
      excludeId: productId,
    });

    if (duplicateMessage) {
      return res.status(409).json({ message: duplicateMessage });
    }

    const resolvedCategory = await resolveCategory({
      shopId,
      categoryId: category_id,
      categoryName: category,
    });

    const [result] = await db.promise().query(
      `UPDATE products
       SET product_name = ?, product_code = ?, barcode = ?, category = ?, category_id = ?,
           unit = ?, buying_price = ?, wholesale_price = ?, selling_price = ?,
           stock_quantity = ?, low_stock_limit = ?, image_url = ?,
           item_type = ?, default_selling_unit = ?, default_purchase_unit = ?,
           base_unit = ?, allow_decimal_qty = ?, quantity_precision = ?,
           tracking_method = ?
       WHERE id = ? AND shop_id = ?`,
      [
        normalizedProductName,
        normalizedProductCode,
        normalizedBarcode,
        resolvedCategory.name,
        resolvedCategory.id,
        foundation.defaultSellingUnit,
        costPrice,
        costPrice,
        Number(selling_price),
        stock_quantity === undefined ? 0 : Number(stock_quantity),
        low_stock_limit === undefined || low_stock_limit === null || low_stock_limit === ""
          ? 5
          : Number(low_stock_limit),
        normalizedImageUrl,
        foundation.itemType,
        foundation.defaultSellingUnit,
        foundation.defaultPurchaseUnit,
        foundation.baseUnit,
        foundation.allowDecimalQty,
        foundation.quantityPrecision,
        foundation.trackingMethod,
        productId,
        shopId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    await createAuditLogFromRequest(req, {
      action: "product_update",
      entity_type: "product",
      entity_id: Number(productId),
      description: `Updated product ${normalizedProductName}`,
    });

    return res.json({ message: "Product updated successfully" });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Update product error:", error.message);
    return res.status(500).json({
      message: "Failed to update product",
      error: error.message,
    });
  }
};

exports.deleteProduct = async (req, res) => {
  const productId = req.params.id;

  if (!isNonNegativeInteger(productId) || Number(productId) === 0) {
    return res.status(400).json({ message: "Valid product id is required" });
  }

  try {
    await ensureProductCatalogSchema();

    const [products] = await db.promise().query(
      "SELECT product_name FROM products WHERE id = ? AND shop_id = ? LIMIT 1",
      [productId, req.user.shop_id]
    );

    const [result] = await db.promise().query(
      "DELETE FROM products WHERE id = ? AND shop_id = ?",
      [productId, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    await createAuditLogFromRequest(req, {
      action: "product_delete",
      entity_type: "product",
      entity_id: Number(productId),
      description: `Deleted product ${products[0]?.product_name || productId}`,
    });

    return res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error.message);
    return res.status(500).json({
      message: "Failed to delete product",
      error: error.message,
    });
  }
};
