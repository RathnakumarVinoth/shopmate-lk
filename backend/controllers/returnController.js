const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");

let returnTablesReady = false;

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const formatMoney = (value) => Number(Number(value || 0).toFixed(2));

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const formatReturn = (returnRow) => ({
  ...returnRow,
  refund_amount: Number(returnRow.refund_amount || 0),
});

const formatReturnItem = (item) => ({
  ...item,
  quantity: Number(item.quantity || 0),
  refund_price: Number(item.refund_price || 0),
  refund_subtotal: Number(item.refund_subtotal || 0),
});

const ensureReturnTables = async (connection = db.promise()) => {
  if (returnTablesReady) return;

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sales_returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      sale_id INT NOT NULL,
      user_id INT NOT NULL,
      refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_returns_shop_id (shop_id),
      INDEX idx_sales_returns_sale_id (sale_id),
      INDEX idx_sales_returns_user_id (user_id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sales_return_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      return_id INT NOT NULL,
      sale_item_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      refund_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      refund_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_return_items_return_id (return_id),
      INDEX idx_sales_return_items_sale_item_id (sale_item_id),
      INDEX idx_sales_return_items_product_id (product_id)
    )
  `);

  returnTablesReady = true;
};

exports.ensureReturnTables = ensureReturnTables;

const getReturnedQuantityMap = async (connection, shopId, saleItemIds) => {
  if (saleItemIds.length === 0) return {};

  const [rows] = await connection.query(
    `SELECT sales_return_items.sale_item_id,
            COALESCE(SUM(sales_return_items.quantity), 0) AS returned_quantity
     FROM sales_return_items
     INNER JOIN sales_returns ON sales_returns.id = sales_return_items.return_id
     WHERE sales_returns.shop_id = ? AND sales_return_items.sale_item_id IN (?)
     GROUP BY sales_return_items.sale_item_id`,
    [shopId, saleItemIds]
  );

  return rows.reduce((map, row) => {
    map[row.sale_item_id] = Number(row.returned_quantity || 0);
    return map;
  }, {});
};

const getReturnDetails = async (connection, shopId, returnId) => {
  const [returns] = await connection.query(
    `SELECT sales_returns.id, sales_returns.sale_id, sales_returns.refund_amount,
            sales_returns.reason, sales_returns.created_at,
            sales.invoice_no, users.name AS user_name
     FROM sales_returns
     INNER JOIN sales ON sales.id = sales_returns.sale_id
     INNER JOIN users ON users.id = sales_returns.user_id
     WHERE sales_returns.id = ? AND sales_returns.shop_id = ?
     LIMIT 1`,
    [returnId, shopId]
  );

  if (returns.length === 0) return null;

  const [items] = await connection.query(
    `SELECT sales_return_items.id, sales_return_items.return_id,
            sales_return_items.sale_item_id, sales_return_items.product_id,
            COALESCE(products.product_name, 'Deleted product') AS product_name,
            sales_return_items.quantity, sales_return_items.refund_price,
            sales_return_items.refund_subtotal
     FROM sales_return_items
     LEFT JOIN products ON products.id = sales_return_items.product_id
     WHERE sales_return_items.return_id = ?
     ORDER BY sales_return_items.id ASC`,
    [returnId]
  );

  return {
    ...formatReturn(returns[0]),
    items: items.map(formatReturnItem),
  };
};

exports.getSaleForReturn = async (req, res) => {
  const shopId = req.user.shop_id;
  const saleIdentifier = String(req.params.sale_id || "").trim();

  if (!saleIdentifier) {
    return res.status(400).json({ message: "Sale id or invoice number is required" });
  }

  try {
    await ensureReturnTables();

    const byId = isPositiveInteger(saleIdentifier);
    const [sales] = await db.promise().query(
      `SELECT sales.id, sales.invoice_no, sales.total_amount,
              sales.discount_amount, sales.payment_type, sales.created_at,
              sales.customer_id, customers.customer_name,
              customers.phone AS customer_phone,
              customers.address AS customer_address
       FROM sales
       LEFT JOIN customers ON customers.id = sales.customer_id
       WHERE sales.shop_id = ? AND ${byId ? "sales.id = ?" : "sales.invoice_no = ?"}
       LIMIT 1`,
      [shopId, byId ? Number(saleIdentifier) : saleIdentifier]
    );

    if (sales.length === 0) {
      return res.status(404).json({ message: "Sale not found" });
    }

    const sale = sales[0];
    const [items] = await db.promise().query(
      `SELECT sale_items.id AS sale_item_id, sale_items.product_id,
              COALESCE(products.product_name, 'Deleted product') AS product_name,
              sale_items.quantity AS sold_quantity, sale_items.selling_price,
              sale_items.subtotal
       FROM sale_items
       LEFT JOIN products ON products.id = sale_items.product_id
       WHERE sale_items.sale_id = ?
       ORDER BY sale_items.id ASC`,
      [sale.id]
    );

    const saleItemIds = items.map((item) => item.sale_item_id);
    const returnedMap = await getReturnedQuantityMap(db.promise(), shopId, saleItemIds);

    return res.json({
      message: "Sale fetched successfully",
      sale: {
        ...sale,
        total_amount: Number(sale.total_amount || 0),
        discount_amount: Number(sale.discount_amount || 0),
        items: items.map((item) => {
          const soldQuantity = Number(item.sold_quantity || 0);
          const alreadyReturnedQuantity = Number(returnedMap[item.sale_item_id] || 0);

          return {
            ...item,
            sold_quantity: soldQuantity,
            already_returned_quantity: alreadyReturnedQuantity,
            available_return_quantity: Math.max(
              soldQuantity - alreadyReturnedQuantity,
              0
            ),
            selling_price: Number(item.selling_price || 0),
            subtotal: Number(item.subtotal || 0),
          };
        }),
      },
    });
  } catch (error) {
    console.error("Get sale for return error:", error.message);
    return res.status(500).json({ message: "Server error while fetching sale" });
  }
};

exports.createReturn = async (req, res) => {
  const shopId = req.user.shop_id;
  const userId = req.user.id;
  const { sale_id, reason } = req.body;

  if (!isPositiveInteger(sale_id)) {
    return res.status(400).json({ message: "sale_id must be a positive integer" });
  }

  if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
    return res.status(400).json({ message: "items must be a non-empty array" });
  }

  const requestedBySaleItem = {};

  for (const [index, item] of req.body.items.entries()) {
    if (!isPositiveInteger(item.sale_item_id)) {
      return res
        .status(400)
        .json({ message: `items[${index}].sale_item_id must be a positive integer` });
    }

    if (!isPositiveInteger(item.quantity)) {
      return res
        .status(400)
        .json({ message: `items[${index}].quantity must be greater than 0` });
    }

    requestedBySaleItem[item.sale_item_id] =
      (requestedBySaleItem[item.sale_item_id] || 0) + Number(item.quantity);
  }

  const saleItemIds = Object.keys(requestedBySaleItem).map(Number);
  const connection = db.promise();

  try {
    await ensureReturnTables(connection);
    await connection.beginTransaction();

    const [sales] = await connection.query(
      `SELECT id, invoice_no
       FROM sales
       WHERE id = ? AND shop_id = ?
       LIMIT 1
       FOR UPDATE`,
      [sale_id, shopId]
    );

    if (sales.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Sale not found" });
    }

    const sale = sales[0];
    const [saleItems] = await connection.query(
      `SELECT sale_items.id AS sale_item_id, sale_items.product_id,
              sale_items.quantity AS sold_quantity, sale_items.selling_price,
              products.product_name, products.stock_quantity
       FROM sale_items
       INNER JOIN products ON products.id = sale_items.product_id
       WHERE sale_items.sale_id = ? AND sale_items.id IN (?)
       FOR UPDATE`,
      [sale_id, saleItemIds]
    );

    if (saleItems.length !== saleItemIds.length) {
      await connection.rollback();
      return res.status(404).json({
        message: "One or more sale items were not found for this sale",
      });
    }

    const returnedMap = await getReturnedQuantityMap(connection, shopId, saleItemIds);
    const saleItemMap = saleItems.reduce((map, item) => {
      map[item.sale_item_id] = item;
      return map;
    }, {});
    const productStock = {};
    const returnItems = [];

    for (const saleItemId of saleItemIds) {
      const saleItem = saleItemMap[saleItemId];
      const soldQuantity = Number(saleItem.sold_quantity || 0);
      const alreadyReturnedQuantity = Number(returnedMap[saleItemId] || 0);
      const quantity = Number(requestedBySaleItem[saleItemId]);
      const availableQuantity = soldQuantity - alreadyReturnedQuantity;

      if (quantity > availableQuantity) {
        await connection.rollback();
        return res.status(400).json({
          message: `Cannot return more than available quantity for ${saleItem.product_name}`,
          sale_item_id: saleItemId,
          sold_quantity: soldQuantity,
          already_returned_quantity: alreadyReturnedQuantity,
          available_return_quantity: Math.max(availableQuantity, 0),
        });
      }

      const refundPrice = formatMoney(saleItem.selling_price);
      const refundSubtotal = formatMoney(refundPrice * quantity);
      productStock[saleItem.product_id] =
        productStock[saleItem.product_id] ?? Number(saleItem.stock_quantity || 0);

      returnItems.push({
        sale_item_id: saleItemId,
        product_id: saleItem.product_id,
        product_name: saleItem.product_name,
        quantity,
        refund_price: refundPrice,
        refund_subtotal: refundSubtotal,
      });
    }

    const refundAmount = formatMoney(
      returnItems.reduce((sum, item) => sum + item.refund_subtotal, 0)
    );

    const [returnResult] = await connection.query(
      `INSERT INTO sales_returns
       (shop_id, sale_id, user_id, refund_amount, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [shopId, sale_id, userId, refundAmount, optionalText(reason)]
    );

    const returnId = returnResult.insertId;
    const returnItemRows = returnItems.map((item) => [
      returnId,
      item.sale_item_id,
      item.product_id,
      item.quantity,
      item.refund_price,
      item.refund_subtotal,
    ]);

    await connection.query(
      `INSERT INTO sales_return_items
       (return_id, sale_item_id, product_id, quantity, refund_price, refund_subtotal)
       VALUES ?`,
      [returnItemRows]
    );

    for (const item of returnItems) {
      const previousStock = productStock[item.product_id];
      const newStock = previousStock + item.quantity;
      productStock[item.product_id] = newStock;

      await connection.query(
        `UPDATE products
         SET stock_quantity = ?
         WHERE id = ? AND shop_id = ?`,
        [newStock, item.product_id, shopId]
      );

      await connection.query(
        `INSERT INTO stock_movements
         (shop_id, product_id, user_id, supplier_id, movement_type, quantity,
          previous_stock, new_stock, buying_price, total_cost, note)
         VALUES (?, ?, ?, NULL, 'adjustment', ?, ?, ?, NULL, 0, ?)`,
        [
          shopId,
          item.product_id,
          userId,
          item.quantity,
          previousStock,
          newStock,
          `Return for ${sale.invoice_no || `sale ${sale.id}`}`,
        ]
      );
    }

    const createdReturn = await getReturnDetails(connection, shopId, returnId);

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "sale_return",
      entity_type: "return",
      entity_id: returnId,
      description: `Processed return for ${sale.invoice_no || `sale ${sale.id}`} with refund ${refundAmount}`,
    });

    return res.status(201).json({
      message: "Return processed successfully",
      return: createdReturn,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Return rollback failed:", rollbackError.message);
    }

    console.error("Create return error:", error.message);
    return res.status(500).json({ message: "Server error while processing return" });
  }
};

exports.getReturns = async (req, res) => {
  try {
    await ensureReturnTables();

    const [returns] = await db.promise().query(
      `SELECT sales_returns.id, sales_returns.sale_id,
              sales.invoice_no, sales_returns.refund_amount,
              sales_returns.reason, users.name AS user_name,
              sales_returns.created_at
       FROM sales_returns
       INNER JOIN sales ON sales.id = sales_returns.sale_id
       INNER JOIN users ON users.id = sales_returns.user_id
       WHERE sales_returns.shop_id = ?
       ORDER BY sales_returns.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Returns fetched successfully",
      returns: returns.map(formatReturn),
    });
  } catch (error) {
    console.error("Get returns error:", error.message);
    return res.status(500).json({ message: "Server error while fetching returns" });
  }
};

exports.getReturnById = async (req, res) => {
  const returnId = req.params.id;

  if (!isPositiveInteger(returnId)) {
    return res.status(400).json({ message: "Valid return id is required" });
  }

  try {
    await ensureReturnTables();

    const returnDetails = await getReturnDetails(
      db.promise(),
      req.user.shop_id,
      Number(returnId)
    );

    if (!returnDetails) {
      return res.status(404).json({ message: "Return not found" });
    }

    return res.json({
      message: "Return fetched successfully",
      return: returnDetails,
    });
  } catch (error) {
    console.error("Get return error:", error.message);
    return res.status(500).json({ message: "Server error while fetching return" });
  }
};
