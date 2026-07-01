const db = require("../config/db");

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const isNonNegativeNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) >= 0;

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const formatMoney = (value) => Number(Number(value).toFixed(2));

const getSupplierStatus = (totalAmount, paidAmount, balanceAmount) => {
  if (balanceAmount === 0) return "paid";
  if (paidAmount > 0 && balanceAmount > 0) return "partial";
  return "unpaid";
};

const formatMovement = (movement) => ({
  ...movement,
  quantity: Number(movement.quantity),
  previous_stock: Number(movement.previous_stock),
  new_stock: Number(movement.new_stock),
  buying_price: Number(movement.buying_price || 0),
  total_cost: Number(movement.total_cost || 0),
});

exports.restockProduct = async (req, res) => {
  const { product_id, supplier_id, quantity, buying_price, paid_amount, note } =
    req.body;
  const shopId = req.user.shop_id;
  const userId = req.user.id;

  if (!isPositiveInteger(product_id)) {
    return res.status(400).json({ message: "product_id must be a positive integer" });
  }

  if (!isPositiveInteger(quantity)) {
    return res.status(400).json({ message: "quantity must be greater than 0" });
  }

  if (supplier_id && !isPositiveInteger(supplier_id)) {
    return res.status(400).json({ message: "supplier_id must be a positive integer" });
  }

  if (buying_price !== undefined && !isNonNegativeNumber(buying_price)) {
    return res
      .status(400)
      .json({ message: "buying_price must be greater than or equal to 0" });
  }

  if (paid_amount !== undefined && !isNonNegativeNumber(paid_amount)) {
    return res
      .status(400)
      .json({ message: "paid_amount must be greater than or equal to 0" });
  }

  const connection = db.promise();

  try {
    await connection.beginTransaction();

    const [products] = await connection.query(
      `SELECT id, product_name, stock_quantity, buying_price
       FROM products
       WHERE id = ? AND shop_id = ?
       LIMIT 1
       FOR UPDATE`,
      [product_id, shopId]
    );

    if (products.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    const product = products[0];
    const supplierId = supplier_id ? Number(supplier_id) : null;

    if (supplierId) {
      const [suppliers] = await connection.query(
        "SELECT id FROM suppliers WHERE id = ? AND shop_id = ? LIMIT 1",
        [supplierId, shopId]
      );

      if (suppliers.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Supplier not found" });
      }
    }

    const restockQuantity = Number(quantity);
    const previousStock = Number(product.stock_quantity);
    const newStock = previousStock + restockQuantity;
    const effectiveBuyingPrice =
      buying_price === undefined
        ? formatMoney(Number(product.buying_price || 0))
        : formatMoney(Number(buying_price));
    const totalCost = formatMoney(restockQuantity * effectiveBuyingPrice);
    const paidAmount = formatMoney(Number(paid_amount || 0));

    if (paidAmount > totalCost) {
      await connection.rollback();
      return res.status(400).json({
        message: "paid_amount cannot be greater than total cost",
        total_cost: totalCost,
      });
    }

    await connection.query(
      `UPDATE products
       SET stock_quantity = ?, buying_price = ?
       WHERE id = ? AND shop_id = ?`,
      [newStock, effectiveBuyingPrice, product_id, shopId]
    );

    const [movementResult] = await connection.query(
      `INSERT INTO stock_movements
       (shop_id, product_id, user_id, supplier_id, movement_type, quantity,
        previous_stock, new_stock, buying_price, total_cost, note)
       VALUES (?, ?, ?, ?, 'restock', ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        product_id,
        userId,
        supplierId,
        restockQuantity,
        previousStock,
        newStock,
        effectiveBuyingPrice,
        totalCost,
        optionalText(note),
      ]
    );

    let supplierTransactionId = null;

    if (supplierId) {
      const balanceAmount = formatMoney(totalCost - paidAmount);
      const status = getSupplierStatus(totalCost, paidAmount, balanceAmount);
      const [transactionResult] = await connection.query(
        `INSERT INTO supplier_transactions
         (shop_id, supplier_id, description, total_amount, paid_amount, balance_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          supplierId,
          `Stock purchase for ${product.product_name}`,
          totalCost,
          paidAmount,
          balanceAmount,
          status,
        ]
      );

      supplierTransactionId = transactionResult.insertId;
    }

    await connection.commit();

    return res.status(201).json({
      message: "Product restocked successfully",
      movement_id: movementResult.insertId,
      supplier_transaction_id: supplierTransactionId,
      product_id: Number(product_id),
      previous_stock: previousStock,
      new_stock: newStock,
      quantity: restockQuantity,
      buying_price: effectiveBuyingPrice,
      total_cost: totalCost,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Restock rollback failed:", rollbackError.message);
    }

    console.error("Restock product error:", error.message);
    return res.status(500).json({ message: "Server error while restocking product" });
  }
};

exports.getStockMovements = async (req, res) => {
  try {
    const [movements] = await db.promise().query(
      `SELECT
         stock_movements.id,
         stock_movements.product_id,
         products.product_name,
         stock_movements.supplier_id,
         suppliers.supplier_name,
         stock_movements.movement_type,
         stock_movements.quantity,
         stock_movements.previous_stock,
         stock_movements.new_stock,
         stock_movements.buying_price,
         stock_movements.total_cost,
         stock_movements.note,
         stock_movements.created_at,
         users.name AS user_name
       FROM stock_movements
       INNER JOIN products ON products.id = stock_movements.product_id
       INNER JOIN users ON users.id = stock_movements.user_id
       LEFT JOIN suppliers ON suppliers.id = stock_movements.supplier_id
       WHERE stock_movements.shop_id = ?
       ORDER BY stock_movements.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Stock movements fetched successfully",
      movements: movements.map(formatMovement),
    });
  } catch (error) {
    console.error("Get stock movements error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching stock movements" });
  }
};

exports.getProductStockMovements = async (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid product id is required" });
  }

  try {
    const [products] = await db.promise().query(
      "SELECT id FROM products WHERE id = ? AND shop_id = ? LIMIT 1",
      [id, req.user.shop_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const [movements] = await db.promise().query(
      `SELECT
         stock_movements.id,
         stock_movements.product_id,
         products.product_name,
         stock_movements.supplier_id,
         suppliers.supplier_name,
         stock_movements.movement_type,
         stock_movements.quantity,
         stock_movements.previous_stock,
         stock_movements.new_stock,
         stock_movements.buying_price,
         stock_movements.total_cost,
         stock_movements.note,
         stock_movements.created_at,
         users.name AS user_name
       FROM stock_movements
       INNER JOIN products ON products.id = stock_movements.product_id
       INNER JOIN users ON users.id = stock_movements.user_id
       LEFT JOIN suppliers ON suppliers.id = stock_movements.supplier_id
       WHERE stock_movements.shop_id = ? AND stock_movements.product_id = ?
       ORDER BY stock_movements.id DESC`,
      [req.user.shop_id, id]
    );

    return res.json({
      message: "Product stock movements fetched successfully",
      movements: movements.map(formatMovement),
    });
  } catch (error) {
    console.error("Get product stock movements error:", error.message);
    return res.status(500).json({
      message: "Server error while fetching product stock movements",
    });
  }
};

exports.getStockSummary = async (req, res) => {
  try {
    const [[productRows], [movementRows]] = await Promise.all([
      db.promise().query(
        `SELECT
           COUNT(*) AS total_products,
           COALESCE(SUM(CASE WHEN stock_quantity <= low_stock_limit THEN 1 ELSE 0 END), 0) AS low_stock_count,
           COALESCE(SUM(stock_quantity * buying_price), 0) AS total_stock_value
         FROM products
         WHERE shop_id = ?`,
        [req.user.shop_id]
      ),
      db.promise().query(
        `SELECT
           COALESCE(SUM(total_cost), 0) AS total_restock_cost_this_month,
           COALESCE(SUM(quantity), 0) AS total_restock_items_this_month
         FROM stock_movements
         WHERE shop_id = ?
           AND movement_type = 'restock'
           AND YEAR(created_at) = YEAR(CURDATE())
           AND MONTH(created_at) = MONTH(CURDATE())`,
        [req.user.shop_id]
      ),
    ]);

    const productSummary = productRows[0] || {};
    const movementSummary = movementRows[0] || {};

    return res.json({
      message: "Stock summary fetched successfully",
      summary: {
        total_products: Number(productSummary.total_products || 0),
        low_stock_count: Number(productSummary.low_stock_count || 0),
        total_stock_value: Number(productSummary.total_stock_value || 0),
        total_restock_cost_this_month: Number(
          movementSummary.total_restock_cost_this_month || 0
        ),
        total_restock_items_this_month: Number(
          movementSummary.total_restock_items_this_month || 0
        ),
      },
    });
  } catch (error) {
    console.error("Get stock summary error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching stock summary" });
  }
};
