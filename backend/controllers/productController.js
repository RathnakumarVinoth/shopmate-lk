const db = require("../config/db");

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

const validateProduct = (body) => {
  const errors = [];

  if (isMissing(body.product_name)) {
    errors.push("product_name is required");
  }

  if (!isNonNegativeNumber(body.buying_price)) {
    errors.push("buying_price is required and must be a non-negative number");
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

exports.addProduct = async (req, res) => {
  const {
    product_name,
    product_code,
    barcode,
    category,
    buying_price,
    selling_price,
    stock_quantity,
    low_stock_limit,
  } = req.body;
  const shopId = req.user.shop_id;
  const normalizedProductName = String(product_name || "").trim();
  const normalizedProductCode = normalizeOptionalText(product_code);
  const normalizedBarcode = normalizeOptionalText(barcode);
  const normalizedCategory = normalizeOptionalText(category);
  const errors = validateProduct(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
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

    const [result] = await db.promise().query(
      `INSERT INTO products
       (shop_id, product_name, product_code, barcode, category, buying_price, selling_price, stock_quantity, low_stock_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        normalizedProductName,
        normalizedProductCode,
        normalizedBarcode,
        normalizedCategory,
        Number(buying_price),
        Number(selling_price),
        stock_quantity === undefined ? 0 : Number(stock_quantity),
        lowStockLimit,
      ]
    );

    return res.status(201).json({
      message: "Product added successfully",
      product_id: result.insertId,
    });
  } catch (error) {
    console.error("Add product error:", error.message);
    return res.status(500).json({
      message: "Failed to add product",
      error: error.message,
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const [products] = await db.promise().query(
      `SELECT id, shop_id, product_name, product_code, barcode, category,
              buying_price, selling_price, stock_quantity, low_stock_limit
       FROM products
       WHERE shop_id = ?
       ORDER BY id DESC`,
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
    const normalizedCode = code.toLowerCase();
    const [products] = await db.promise().query(
      `SELECT id, shop_id, product_name, product_code, barcode, category,
              buying_price, selling_price, stock_quantity, low_stock_limit
       FROM products
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
    const [products] = await db.promise().query(
      `SELECT *
       FROM products
       WHERE shop_id = ? AND stock_quantity <= low_stock_limit
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
    buying_price,
    selling_price,
    stock_quantity,
    low_stock_limit,
  } = req.body;
  const shopId = req.user.shop_id;
  const normalizedProductName = String(product_name || "").trim();
  const normalizedProductCode = normalizeOptionalText(product_code);
  const normalizedBarcode = normalizeOptionalText(barcode);
  const normalizedCategory = normalizeOptionalText(category);
  const errors = validateProduct(req.body);

  if (!isNonNegativeInteger(productId) || Number(productId) === 0) {
    return res.status(400).json({ message: "Valid product id is required" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    const duplicateMessage = await checkDuplicateCodes({
      shopId,
      productCode: normalizedProductCode,
      barcode: normalizedBarcode,
      excludeId: productId,
    });

    if (duplicateMessage) {
      return res.status(409).json({ message: duplicateMessage });
    }

    const [result] = await db.promise().query(
      `UPDATE products
       SET product_name = ?, product_code = ?, barcode = ?, category = ?,
           buying_price = ?, selling_price = ?, stock_quantity = ?, low_stock_limit = ?
       WHERE id = ? AND shop_id = ?`,
      [
        normalizedProductName,
        normalizedProductCode,
        normalizedBarcode,
        normalizedCategory,
        Number(buying_price),
        Number(selling_price),
        stock_quantity === undefined ? 0 : Number(stock_quantity),
        low_stock_limit === undefined || low_stock_limit === null || low_stock_limit === ""
          ? 5
          : Number(low_stock_limit),
        productId,
        shopId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ message: "Product updated successfully" });
  } catch (error) {
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
    const [result] = await db.promise().query(
      "DELETE FROM products WHERE id = ? AND shop_id = ?",
      [productId, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error.message);
    return res.status(500).json({
      message: "Failed to delete product",
      error: error.message,
    });
  }
};
