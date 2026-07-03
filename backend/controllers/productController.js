const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");
const { ensureProductCatalogSchema } = require("../utils/productCatalogSchema");

const allowedUnits = ["pcs", "kg", "g", "L", "ml", "packet", "bottle", "box"];

const productSelect = `
  products.id,
  products.shop_id,
  products.product_name,
  products.product_code,
  products.barcode,
  products.category_id,
  COALESCE(product_categories.name, products.category) AS category,
  products.unit,
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

const normalizeBoolean = (value, defaultValue = true) => {
  if (value === undefined) return defaultValue ? 1 : 0;
  if (value === false || value === 0 || value === "0" || value === "false") return 0;
  return 1;
};

const validateProduct = (body) => {
  const errors = [];
  const costPrice = body.wholesale_price ?? body.buying_price;

  if (isMissing(body.product_name)) {
    errors.push("product_name is required");
  }

  if (!isNonNegativeNumber(costPrice)) {
    errors.push("wholesale_price is required and must be a non-negative number");
  }

  if (!isNonNegativeNumber(body.selling_price)) {
    errors.push("selling_price is required and must be a non-negative number");
  }

  if (
    body.stock_quantity !== undefined &&
    !isNonNegativeInteger(body.stock_quantity)
  ) {
    errors.push("stock_quantity must be a non-negative integer");
  }

  if (
    body.low_stock_limit !== undefined &&
    body.low_stock_limit !== "" &&
    body.low_stock_limit !== null &&
    !isNonNegativeInteger(body.low_stock_limit)
  ) {
    errors.push("low_stock_limit must be a non-negative integer");
  }

  if (body.unit !== undefined && body.unit !== "" && !allowedUnits.includes(body.unit)) {
    errors.push(`unit must be one of ${allowedUnits.join(", ")}`);
  }

  return errors;
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
       WHERE products.shop_id = ?
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
    unit,
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
  const normalizedUnit = unit || "pcs";
  const costPrice = Number(wholesale_price ?? buying_price);
  const errors = validateProduct(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    await ensureProductCatalogSchema();

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
        buying_price, wholesale_price, selling_price, stock_quantity, low_stock_limit, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        normalizedProductName,
        normalizedProductCode,
        normalizedBarcode,
        resolvedCategory.name,
        resolvedCategory.id,
        normalizedUnit,
        costPrice,
        costPrice,
        Number(selling_price),
        stock_quantity === undefined ? 0 : Number(stock_quantity),
        lowStockLimit,
        normalizedImageUrl,
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
       LEFT JOIN product_categories ON product_categories.id = products.category_id
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
       LEFT JOIN product_categories ON product_categories.id = products.category_id
       WHERE shop_id = ?
         AND (
           product_code = ?
           OR barcode = ?
           OR LOWER(product_code) = ?
           OR LOWER(barcode) = ?
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
       LEFT JOIN product_categories ON product_categories.id = products.category_id
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
    unit,
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
  const normalizedUnit = unit || "pcs";
  const costPrice = Number(wholesale_price ?? buying_price);
  const errors = validateProduct(req.body);

  if (!isNonNegativeInteger(productId) || Number(productId) === 0) {
    return res.status(400).json({ message: "Valid product id is required" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    await ensureProductCatalogSchema();

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
           stock_quantity = ?, low_stock_limit = ?, image_url = ?
       WHERE id = ? AND shop_id = ?`,
      [
        normalizedProductName,
        normalizedProductCode,
        normalizedBarcode,
        resolvedCategory.name,
        resolvedCategory.id,
        normalizedUnit,
        costPrice,
        costPrice,
        Number(selling_price),
        stock_quantity === undefined ? 0 : Number(stock_quantity),
        low_stock_limit === undefined || low_stock_limit === null || low_stock_limit === ""
          ? 5
          : Number(low_stock_limit),
        normalizedImageUrl,
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
