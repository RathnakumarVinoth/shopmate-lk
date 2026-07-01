const db = require("../config/db");

exports.addProduct = (req, res) => {
  const {
    product_name,
    category,
    buying_price,
    selling_price,
    stock_quantity,
    low_stock_limit,
  } = req.body;

  const shop_id = req.user.shop_id;

  if (!product_name || buying_price === undefined || selling_price === undefined) {
    return res.status(400).json({
      message: "Product name, buying price, and selling price are required",
    });
  }

  const sql = `
    INSERT INTO products 
    (shop_id, product_name, category, buying_price, selling_price, stock_quantity, low_stock_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      shop_id,
      product_name,
      category || null,
      buying_price,
      selling_price,
      stock_quantity || 0,
      low_stock_limit || 5,
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Failed to add product",
          error: err.message,
        });
      }

      res.status(201).json({
        message: "Product added successfully",
        product_id: result.insertId,
      });
    }
  );
};

exports.getProducts = (req, res) => {
  const shop_id = req.user.shop_id;

  const sql = "SELECT * FROM products WHERE shop_id = ? ORDER BY id DESC";

  db.query(sql, [shop_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to get products",
        error: err.message,
      });
    }

    res.json(results);
  });
};

exports.getLowStockProducts = (req, res) => {
  const shop_id = req.user.shop_id;

  const sql = `
    SELECT * FROM products 
    WHERE shop_id = ? AND stock_quantity <= low_stock_limit
    ORDER BY stock_quantity ASC
  `;

  db.query(sql, [shop_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to get low stock products",
        error: err.message,
      });
    }

    res.json(results);
  });
};

exports.updateProduct = (req, res) => {
  const shop_id = req.user.shop_id;
  const product_id = req.params.id;

  const {
    product_name,
    category,
    buying_price,
    selling_price,
    stock_quantity,
    low_stock_limit,
  } = req.body;

  const sql = `
    UPDATE products
    SET product_name = ?, category = ?, buying_price = ?, selling_price = ?, 
        stock_quantity = ?, low_stock_limit = ?
    WHERE id = ? AND shop_id = ?
  `;

  db.query(
    sql,
    [
      product_name,
      category,
      buying_price,
      selling_price,
      stock_quantity,
      low_stock_limit,
      product_id,
      shop_id,
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          message: "Failed to update product",
          error: err.message,
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json({ message: "Product updated successfully" });
    }
  );
};

exports.deleteProduct = (req, res) => {
  const shop_id = req.user.shop_id;
  const product_id = req.params.id;

  const sql = "DELETE FROM products WHERE id = ? AND shop_id = ?";

  db.query(sql, [product_id, shop_id], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete product",
        error: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Product deleted successfully" });
  });
};