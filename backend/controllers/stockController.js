const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");
const { ensureProductCatalogSchema } = require("../utils/productCatalogSchema");
const { ensureStockControlSchema } = require("../utils/stockControlSchema");

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const isNonNegativeNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) >= 0;

const isNonNegativeInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) >= 0;

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const formatMoney = (value) => Number(Number(value).toFixed(2));
const formatDatePart = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const generateReference = (prefix, id, date = new Date()) =>
  `${prefix}-${formatDatePart(date)}-${String(id).padStart(4, "0")}`;

const stockAdjustmentTypes = new Set([
  "damaged",
  "expired",
  "lost",
  "correction",
  "other",
]);

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

const formatAdjustment = (adjustment) => ({
  ...adjustment,
  quantity: Number(adjustment.quantity || 0),
  previous_stock: Number(adjustment.previous_stock || 0),
  new_stock: Number(adjustment.new_stock || 0),
  previous_batch_quantity:
    adjustment.previous_batch_quantity === null
      ? null
      : Number(adjustment.previous_batch_quantity || 0),
  new_batch_quantity:
    adjustment.new_batch_quantity === null
      ? null
      : Number(adjustment.new_batch_quantity || 0),
});

const formatReconciliation = (reconciliation) => ({
  ...reconciliation,
  item_count: Number(reconciliation.item_count || 0),
  total_variance: Number(reconciliation.total_variance || 0),
});

const formatReconciliationItem = (item) => ({
  ...item,
  system_quantity: Number(item.system_quantity || 0),
  physical_quantity: Number(item.physical_quantity || 0),
  variance: Number(item.variance || 0),
  previous_stock: item.previous_stock === null ? null : Number(item.previous_stock || 0),
  new_stock: item.new_stock === null ? null : Number(item.new_stock || 0),
  previous_batch_quantity:
    item.previous_batch_quantity === null ? null : Number(item.previous_batch_quantity || 0),
  new_batch_quantity:
    item.new_batch_quantity === null ? null : Number(item.new_batch_quantity || 0),
});

const loadAdjustmentById = async (connection, shopId, adjustmentId) => {
  const [rows] = await connection.query(
    `SELECT stock_adjustments.*, products.product_name, products.product_code,
            stock_batches.batch_code, users.name AS created_by_name
     FROM stock_adjustments
     INNER JOIN products
       ON products.id = stock_adjustments.product_id
      AND products.shop_id = stock_adjustments.shop_id
     LEFT JOIN stock_batches
       ON stock_batches.id = stock_adjustments.batch_id
      AND stock_batches.shop_id = stock_adjustments.shop_id
     LEFT JOIN users
       ON users.id = stock_adjustments.created_by
      AND users.shop_id = stock_adjustments.shop_id
     WHERE stock_adjustments.shop_id = ?
       AND stock_adjustments.id = ?
     LIMIT 1`,
    [shopId, adjustmentId]
  );

  return rows[0] ? formatAdjustment(rows[0]) : null;
};

const loadReconciliationDetail = async (connection, shopId, reconciliationId) => {
  const [reconciliations] = await connection.query(
    `SELECT stock_reconciliations.*,
            COALESCE(item_summary.item_count, 0) AS item_count,
            COALESCE(item_summary.total_variance, 0) AS total_variance,
            users.name AS created_by_name
     FROM stock_reconciliations
     LEFT JOIN (
       SELECT shop_id, reconciliation_id,
              COUNT(*) AS item_count,
              SUM(variance) AS total_variance
       FROM stock_reconciliation_items
       GROUP BY shop_id, reconciliation_id
     ) AS item_summary
       ON item_summary.shop_id = stock_reconciliations.shop_id
      AND item_summary.reconciliation_id = stock_reconciliations.id
     LEFT JOIN users
       ON users.id = stock_reconciliations.created_by
      AND users.shop_id = stock_reconciliations.shop_id
     WHERE stock_reconciliations.shop_id = ?
       AND stock_reconciliations.id = ?
     LIMIT 1`,
    [shopId, reconciliationId]
  );

  if (reconciliations.length === 0) return null;

  const [items] = await connection.query(
    `SELECT stock_reconciliation_items.*, products.product_name,
            products.product_code, stock_batches.batch_code
     FROM stock_reconciliation_items
     INNER JOIN products
       ON products.id = stock_reconciliation_items.product_id
      AND products.shop_id = stock_reconciliation_items.shop_id
     LEFT JOIN stock_batches
       ON stock_batches.id = stock_reconciliation_items.batch_id
      AND stock_batches.shop_id = stock_reconciliation_items.shop_id
     WHERE stock_reconciliation_items.shop_id = ?
       AND stock_reconciliation_items.reconciliation_id = ?
     ORDER BY stock_reconciliation_items.id ASC`,
    [shopId, reconciliationId]
  );

  return {
    ...formatReconciliation(reconciliations[0]),
    items: items.map(formatReconciliationItem),
  };
};

const getProductForUpdate = async (connection, shopId, productId) => {
  const [products] = await connection.query(
    `SELECT id, product_name, stock_quantity, buying_price,
            COALESCE(wholesale_price, buying_price) AS wholesale_price
     FROM products
     WHERE id = ? AND shop_id = ?
     LIMIT 1
     FOR UPDATE`,
    [productId, shopId]
  );

  return products[0] || null;
};

const getBatchForUpdate = async (connection, shopId, batchId) => {
  const [batches] = await connection.query(
    `SELECT id, product_id, batch_code, quantity_remaining
     FROM stock_batches
     WHERE id = ? AND shop_id = ?
     LIMIT 1
     FOR UPDATE`,
    [batchId, shopId]
  );

  return batches[0] || null;
};

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
    await ensureProductCatalogSchema();
    await connection.beginTransaction();

    const [products] = await connection.query(
      `SELECT id, product_name, stock_quantity, buying_price,
              COALESCE(wholesale_price, buying_price) AS wholesale_price
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
        ? formatMoney(Number((product.wholesale_price ?? product.buying_price) || 0))
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
       SET stock_quantity = ?, buying_price = ?, wholesale_price = ?
       WHERE id = ? AND shop_id = ?`,
      [newStock, effectiveBuyingPrice, effectiveBuyingPrice, product_id, shopId]
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

    await createAuditLogFromRequest(req, {
      action: "stock_restock",
      entity_type: "product",
      entity_id: Number(product_id),
      description: `Restocked ${product.product_name} by ${restockQuantity}; stock ${previousStock} to ${newStock}`,
    });

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
       INNER JOIN products
         ON products.id = stock_movements.product_id
        AND products.shop_id = stock_movements.shop_id
       INNER JOIN users
         ON users.id = stock_movements.user_id
        AND users.shop_id = stock_movements.shop_id
       LEFT JOIN suppliers
         ON suppliers.id = stock_movements.supplier_id
        AND suppliers.shop_id = stock_movements.shop_id
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
       INNER JOIN products
         ON products.id = stock_movements.product_id
        AND products.shop_id = stock_movements.shop_id
       INNER JOIN users
         ON users.id = stock_movements.user_id
        AND users.shop_id = stock_movements.shop_id
       LEFT JOIN suppliers
         ON suppliers.id = stock_movements.supplier_id
        AND suppliers.shop_id = stock_movements.shop_id
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
    await ensureProductCatalogSchema();

    const [[productRows], [movementRows]] = await Promise.all([
      db.promise().query(
        `SELECT
           COUNT(*) AS total_products,
           COALESCE(SUM(CASE WHEN stock_quantity <= low_stock_limit THEN 1 ELSE 0 END), 0) AS low_stock_count,
           COALESCE(SUM(stock_quantity * COALESCE(wholesale_price, buying_price)), 0) AS total_stock_value
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

exports.getStockAdjustments = async (req, res) => {
  try {
    await ensureStockControlSchema();

    const [adjustments] = await db.promise().query(
      `SELECT stock_adjustments.*, products.product_name, products.product_code,
              stock_batches.batch_code, users.name AS created_by_name
       FROM stock_adjustments
       INNER JOIN products
         ON products.id = stock_adjustments.product_id
        AND products.shop_id = stock_adjustments.shop_id
       LEFT JOIN stock_batches
         ON stock_batches.id = stock_adjustments.batch_id
        AND stock_batches.shop_id = stock_adjustments.shop_id
       LEFT JOIN users
         ON users.id = stock_adjustments.created_by
        AND users.shop_id = stock_adjustments.shop_id
       WHERE stock_adjustments.shop_id = ?
       ORDER BY stock_adjustments.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Stock adjustments fetched successfully",
      adjustments: adjustments.map(formatAdjustment),
    });
  } catch (error) {
    console.error("Get stock adjustments error:", error.message);
    return res.status(500).json({
      message: "Server error while fetching stock adjustments",
    });
  }
};

exports.createStockAdjustment = async (req, res) => {
  const productId = Number(req.body.product_id);
  const batchId = req.body.batch_id ? Number(req.body.batch_id) : null;
  const quantity = Number(req.body.quantity);
  const adjustmentType = optionalText(req.body.adjustment_type);
  const reason = optionalText(req.body.reason);
  const idempotencyKey = optionalText(
    req.headers["idempotency-key"] || req.body.idempotency_key
  );
  const shopId = req.user.shop_id;
  const connection = db.promise();

  if (!isPositiveInteger(productId)) {
    return res.status(400).json({ message: "product_id must be a positive integer" });
  }

  if (batchId && !isPositiveInteger(batchId)) {
    return res.status(400).json({ message: "batch_id must be a positive integer" });
  }

  if (!stockAdjustmentTypes.has(adjustmentType)) {
    return res.status(400).json({
      message: "adjustment_type must be damaged, expired, lost, correction, or other",
    });
  }

  if (!isPositiveInteger(quantity)) {
    return res.status(400).json({ message: "quantity must be greater than 0" });
  }

  if (!reason) {
    return res.status(400).json({ message: "reason is required" });
  }

  try {
    await ensureStockControlSchema();

    if (idempotencyKey) {
      const [existing] = await db.promise().query(
        `SELECT id FROM stock_adjustments
         WHERE shop_id = ? AND idempotency_key = ?
         LIMIT 1`,
        [shopId, idempotencyKey]
      );

      if (existing.length > 0) {
        const adjustment = await loadAdjustmentById(db.promise(), shopId, existing[0].id);
        return res.json({
          message: "Stock adjustment already processed",
          adjustment,
        });
      }
    }

    await connection.beginTransaction();

    const [duplicates] = await connection.query(
      `SELECT id FROM stock_adjustments
       WHERE shop_id = ?
         AND product_id = ?
         AND batch_id <=> ?
         AND adjustment_type = ?
         AND quantity = ?
         AND reason = ?
         AND created_by = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
       LIMIT 1`,
      [shopId, productId, batchId, adjustmentType, quantity, reason, req.user.id]
    );

    if (duplicates.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: "Duplicate stock adjustment request was not applied",
      });
    }

    const product = await getProductForUpdate(connection, shopId, productId);

    if (!product) {
      await connection.rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    const previousStock = Number(product.stock_quantity || 0);

    if (quantity > previousStock) {
      await connection.rollback();
      return res.status(400).json({
        message: "Adjustment quantity cannot reduce product stock below zero",
        available_quantity: previousStock,
      });
    }

    let previousBatchQuantity = null;
    let newBatchQuantity = null;

    if (batchId) {
      const batch = await getBatchForUpdate(connection, shopId, batchId);

      if (!batch || Number(batch.product_id) !== productId) {
        await connection.rollback();
        return res.status(404).json({ message: "Batch not found for this product" });
      }

      previousBatchQuantity = Number(batch.quantity_remaining || 0);

      if (quantity > previousBatchQuantity) {
        await connection.rollback();
        return res.status(400).json({
          message: "Adjustment quantity cannot reduce batch stock below zero",
          available_quantity: previousBatchQuantity,
        });
      }

      newBatchQuantity = previousBatchQuantity - quantity;

      await connection.query(
        `UPDATE stock_batches
         SET quantity_remaining = ?,
             status = ?
         WHERE id = ? AND shop_id = ?`,
        [newBatchQuantity, newBatchQuantity > 0 ? "active" : "depleted", batchId, shopId]
      );
    }

    const newStock = previousStock - quantity;
    const effectiveBuyingPrice = formatMoney(
      Number((product.wholesale_price ?? product.buying_price) || 0)
    );
    const totalCost = formatMoney(quantity * effectiveBuyingPrice);

    await connection.query(
      `UPDATE products
       SET stock_quantity = ?
       WHERE id = ? AND shop_id = ?`,
      [newStock, productId, shopId]
    );

    const [adjustmentResult] = await connection.query(
      `INSERT INTO stock_adjustments
       (shop_id, product_id, batch_id, idempotency_key, adjustment_type, quantity,
        previous_stock, new_stock, previous_batch_quantity, new_batch_quantity,
        reason, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)`,
      [
        shopId,
        productId,
        batchId,
        idempotencyKey,
        adjustmentType,
        quantity,
        previousStock,
        newStock,
        previousBatchQuantity,
        newBatchQuantity,
        reason,
        req.user.id,
      ]
    );

    const adjustmentId = adjustmentResult.insertId;
    const adjustmentNumber = generateReference("ADJ", adjustmentId);

    await connection.query(
      `UPDATE stock_adjustments
       SET adjustment_number = ?
       WHERE id = ? AND shop_id = ?`,
      [adjustmentNumber, adjustmentId, shopId]
    );

    await connection.query(
      `INSERT INTO stock_movements
       (shop_id, product_id, user_id, supplier_id, movement_type, quantity,
        previous_stock, new_stock, buying_price, total_cost, note,
        batch_id, reference_type, reference_id)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'stock_adjustment', ?)`,
      [
        shopId,
        productId,
        req.user.id,
        `stock_adjustment_${adjustmentType}`,
        quantity,
        previousStock,
        newStock,
        effectiveBuyingPrice,
        totalCost,
        reason,
        batchId,
        adjustmentId,
      ]
    );

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "stock_adjustment_create",
      entity_type: "stock_adjustment",
      entity_id: adjustmentId,
      description: `Created ${adjustmentType} stock adjustment ${adjustmentNumber} for ${product.product_name}`,
    });

    const adjustment = await loadAdjustmentById(db.promise(), shopId, adjustmentId);
    return res.status(201).json({
      message: "Stock adjustment created successfully",
      adjustment,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Stock adjustment rollback failed:", rollbackError.message);
    }

    if (error.code === "ER_DUP_ENTRY" && idempotencyKey) {
      const [existing] = await db.promise().query(
        `SELECT id FROM stock_adjustments
         WHERE shop_id = ? AND idempotency_key = ?
         LIMIT 1`,
        [shopId, idempotencyKey]
      );
      const adjustment = existing[0]
        ? await loadAdjustmentById(db.promise(), shopId, existing[0].id)
        : null;

      return res.json({
        message: "Stock adjustment already processed",
        adjustment,
      });
    }

    console.error("Create stock adjustment error:", error.message);
    return res.status(500).json({
      message: "Server error while creating stock adjustment",
    });
  }
};

exports.getStockReconciliations = async (req, res) => {
  try {
    await ensureStockControlSchema();

    const [reconciliations] = await db.promise().query(
      `SELECT stock_reconciliations.*,
              COALESCE(item_summary.item_count, 0) AS item_count,
              COALESCE(item_summary.total_variance, 0) AS total_variance,
              users.name AS created_by_name
       FROM stock_reconciliations
       LEFT JOIN (
         SELECT shop_id, reconciliation_id,
                COUNT(*) AS item_count,
                SUM(variance) AS total_variance
         FROM stock_reconciliation_items
         GROUP BY shop_id, reconciliation_id
       ) AS item_summary
         ON item_summary.shop_id = stock_reconciliations.shop_id
        AND item_summary.reconciliation_id = stock_reconciliations.id
       LEFT JOIN users
         ON users.id = stock_reconciliations.created_by
        AND users.shop_id = stock_reconciliations.shop_id
       WHERE stock_reconciliations.shop_id = ?
       ORDER BY stock_reconciliations.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Stock reconciliations fetched successfully",
      reconciliations: reconciliations.map(formatReconciliation),
    });
  } catch (error) {
    console.error("Get stock reconciliations error:", error.message);
    return res.status(500).json({
      message: "Server error while fetching stock reconciliations",
    });
  }
};

exports.createStockReconciliation = async (req, res) => {
  const reason = optionalText(req.body.reason || req.body.notes);
  const notes = optionalText(req.body.notes);
  const shopId = req.user.shop_id;
  const connection = db.promise();

  if (!reason) {
    return res.status(400).json({ message: "reason is required" });
  }

  if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
    return res.status(400).json({ message: "items must be a non-empty array" });
  }

  const itemKeys = new Set();

  for (const [index, item] of req.body.items.entries()) {
    if (!isPositiveInteger(item.product_id)) {
      return res.status(400).json({
        message: `items[${index}].product_id must be a positive integer`,
      });
    }

    if (item.batch_id && !isPositiveInteger(item.batch_id)) {
      return res.status(400).json({
        message: `items[${index}].batch_id must be a positive integer`,
      });
    }

    if (!isNonNegativeInteger(item.physical_quantity)) {
      return res.status(400).json({
        message: `items[${index}].physical_quantity must be greater than or equal to 0`,
      });
    }

    const key = `${Number(item.product_id)}:${item.batch_id ? Number(item.batch_id) : "product"}`;

    if (itemKeys.has(key)) {
      return res.status(400).json({
        message: `items[${index}] duplicates another reconciliation item`,
      });
    }

    itemKeys.add(key);
  }

  try {
    await ensureStockControlSchema();
    await connection.beginTransaction();

    const normalizedItems = [];

    for (const item of req.body.items) {
      const productId = Number(item.product_id);
      const batchId = item.batch_id ? Number(item.batch_id) : null;
      const product = await getProductForUpdate(connection, shopId, productId);

      if (!product) {
        await connection.rollback();
        return res.status(404).json({ message: "One or more products were not found" });
      }

      let systemQuantity = Number(product.stock_quantity || 0);

      if (batchId) {
        const batch = await getBatchForUpdate(connection, shopId, batchId);

        if (!batch || Number(batch.product_id) !== productId) {
          await connection.rollback();
          return res.status(404).json({ message: "One or more batches were not found" });
        }

        systemQuantity = Number(batch.quantity_remaining || 0);
      }

      const physicalQuantity = Number(item.physical_quantity);
      normalizedItems.push({
        product_id: productId,
        batch_id: batchId,
        system_quantity: systemQuantity,
        physical_quantity: physicalQuantity,
        variance: physicalQuantity - systemQuantity,
      });
    }

    const [reconciliationResult] = await connection.query(
      `INSERT INTO stock_reconciliations
       (shop_id, status, reason, notes, created_by)
       VALUES (?, 'draft', ?, ?, ?)`,
      [shopId, reason, notes, req.user.id]
    );

    const reconciliationId = reconciliationResult.insertId;
    const reconciliationNumber = generateReference("REC", reconciliationId);

    await connection.query(
      `UPDATE stock_reconciliations
       SET reconciliation_number = ?
       WHERE id = ? AND shop_id = ?`,
      [reconciliationNumber, reconciliationId, shopId]
    );

    await connection.query(
      `INSERT INTO stock_reconciliation_items
       (reconciliation_id, shop_id, product_id, batch_id, system_quantity,
        physical_quantity, variance)
       VALUES ?`,
      [
        normalizedItems.map((item) => [
          reconciliationId,
          shopId,
          item.product_id,
          item.batch_id,
          item.system_quantity,
          item.physical_quantity,
          item.variance,
        ]),
      ]
    );

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "stock_reconciliation_create",
      entity_type: "stock_reconciliation",
      entity_id: reconciliationId,
      description: `Created stock reconciliation ${reconciliationNumber}`,
    });

    const reconciliation = await loadReconciliationDetail(
      db.promise(),
      shopId,
      reconciliationId
    );
    return res.status(201).json({
      message: "Stock reconciliation created successfully",
      reconciliation,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Stock reconciliation rollback failed:", rollbackError.message);
    }

    console.error("Create stock reconciliation error:", error.message);
    return res.status(500).json({
      message: "Server error while creating stock reconciliation",
    });
  }
};

exports.getStockReconciliationById = async (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ message: "Valid reconciliation id is required" });
  }

  try {
    await ensureStockControlSchema();

    const reconciliation = await loadReconciliationDetail(
      db.promise(),
      req.user.shop_id,
      Number(req.params.id)
    );

    if (!reconciliation) {
      return res.status(404).json({ message: "Stock reconciliation not found" });
    }

    return res.json({
      message: "Stock reconciliation fetched successfully",
      reconciliation,
    });
  } catch (error) {
    console.error("Get stock reconciliation error:", error.message);
    return res.status(500).json({
      message: "Server error while fetching stock reconciliation",
    });
  }
};

exports.postStockReconciliation = async (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ message: "Valid reconciliation id is required" });
  }

  const reconciliationId = Number(req.params.id);
  const shopId = req.user.shop_id;
  const connection = db.promise();

  try {
    await ensureStockControlSchema();
    await connection.beginTransaction();

    const [reconciliations] = await connection.query(
      `SELECT *
       FROM stock_reconciliations
       WHERE id = ? AND shop_id = ?
       LIMIT 1
       FOR UPDATE`,
      [reconciliationId, shopId]
    );

    if (reconciliations.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Stock reconciliation not found" });
    }

    const reconciliation = reconciliations[0];

    if (reconciliation.status !== "draft") {
      await connection.rollback();
      return res.status(409).json({ message: "Stock reconciliation has already been posted" });
    }

    const [items] = await connection.query(
      `SELECT *
       FROM stock_reconciliation_items
       WHERE reconciliation_id = ? AND shop_id = ?
       ORDER BY id ASC`,
      [reconciliationId, shopId]
    );

    if (items.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Stock reconciliation has no items" });
    }

    const postedItems = [];

    for (const item of items) {
      const product = await getProductForUpdate(connection, shopId, Number(item.product_id));

      if (!product) {
        await connection.rollback();
        return res.status(404).json({ message: "Product not found" });
      }

      const variance = Number(item.variance || 0);
      const previousStock = Number(product.stock_quantity || 0);
      const newStock = previousStock + variance;
      let previousBatchQuantity = null;
      let newBatchQuantity = null;

      if (newStock < 0) {
        await connection.rollback();
        return res.status(400).json({
          message: `Reconciliation would reduce ${product.product_name} below zero`,
          product_id: product.id,
          available_quantity: previousStock,
        });
      }

      if (item.batch_id) {
        const batch = await getBatchForUpdate(connection, shopId, Number(item.batch_id));

        if (!batch || Number(batch.product_id) !== Number(item.product_id)) {
          await connection.rollback();
          return res.status(404).json({ message: "Batch not found for this product" });
        }

        previousBatchQuantity = Number(batch.quantity_remaining || 0);
        newBatchQuantity = previousBatchQuantity + variance;

        if (newBatchQuantity < 0) {
          await connection.rollback();
          return res.status(400).json({
            message: "Reconciliation would reduce batch stock below zero",
            batch_id: batch.id,
            available_quantity: previousBatchQuantity,
          });
        }

        await connection.query(
          `UPDATE stock_batches
           SET quantity_remaining = ?,
               status = ?
           WHERE id = ? AND shop_id = ?`,
          [
            newBatchQuantity,
            newBatchQuantity > 0 ? "active" : "depleted",
            batch.id,
            shopId,
          ]
        );
      }

      await connection.query(
        `UPDATE products
         SET stock_quantity = ?
         WHERE id = ? AND shop_id = ?`,
        [newStock, product.id, shopId]
      );

      await connection.query(
        `UPDATE stock_reconciliation_items
         SET previous_stock = ?,
             new_stock = ?,
             previous_batch_quantity = ?,
             new_batch_quantity = ?
         WHERE id = ? AND shop_id = ?`,
        [
          previousStock,
          newStock,
          previousBatchQuantity,
          newBatchQuantity,
          item.id,
          shopId,
        ]
      );

      if (variance !== 0) {
        const movementQuantity = Math.abs(variance);
        const effectiveBuyingPrice = formatMoney(
          Number((product.wholesale_price ?? product.buying_price) || 0)
        );

        await connection.query(
          `INSERT INTO stock_movements
           (shop_id, product_id, user_id, supplier_id, movement_type, quantity,
            previous_stock, new_stock, buying_price, total_cost, note,
            batch_id, reference_type, reference_id)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'stock_reconciliation', ?)`,
          [
            shopId,
            product.id,
            req.user.id,
            variance > 0
              ? "stock_reconciliation_increase"
              : "stock_reconciliation_decrease",
            movementQuantity,
            previousStock,
            newStock,
            effectiveBuyingPrice,
            formatMoney(movementQuantity * effectiveBuyingPrice),
            reconciliation.reason,
            item.batch_id || null,
            reconciliationId,
          ]
        );
      }

      postedItems.push({
        product_id: product.id,
        batch_id: item.batch_id || null,
        variance,
        previous_stock: previousStock,
        new_stock: newStock,
        previous_batch_quantity: previousBatchQuantity,
        new_batch_quantity: newBatchQuantity,
      });
    }

    await connection.query(
      `UPDATE stock_reconciliations
       SET status = 'posted', posted_by = ?, posted_at = NOW()
       WHERE id = ? AND shop_id = ?`,
      [req.user.id, reconciliationId, shopId]
    );

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "stock_reconciliation_post",
      entity_type: "stock_reconciliation",
      entity_id: reconciliationId,
      description: `Posted stock reconciliation ${
        reconciliation.reconciliation_number || reconciliationId
      }`,
    });

    const postedReconciliation = await loadReconciliationDetail(
      db.promise(),
      shopId,
      reconciliationId
    );
    return res.json({
      message: "Stock reconciliation posted successfully",
      reconciliation: postedReconciliation,
      items: postedItems,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Post stock reconciliation rollback failed:", rollbackError.message);
    }

    console.error("Post stock reconciliation error:", error.message);
    return res.status(500).json({
      message: "Server error while posting stock reconciliation",
    });
  }
};
