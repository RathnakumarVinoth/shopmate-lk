const formatMoney = (value) => Number(Number(value || 0).toFixed(2));

const getBatchTrackingSummary = async (connection, shopId, productId) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS batch_count,
            COALESCE(SUM(CASE
              WHEN status = 'active' AND quantity_remaining > 0 THEN quantity_remaining
              ELSE 0
            END), 0) AS available_quantity
     FROM stock_batches
     WHERE shop_id = ? AND product_id = ?`,
    [shopId, productId]
  );

  return {
    batch_count: Number(rows[0]?.batch_count || 0),
    available_quantity: Number(rows[0]?.available_quantity || 0),
  };
};

const getProductStock = async (connection, shopId, productId) => {
  const [rows] = await connection.query(
    `SELECT stock_quantity
     FROM products
     WHERE id = ? AND shop_id = ?
     LIMIT 1
     FOR UPDATE`,
    [productId, shopId]
  );

  return Number(rows[0]?.stock_quantity || 0);
};

const ensureCursorValue = async (connection, productStockCursor, shopId, productId) => {
  if (productStockCursor && productStockCursor[productId] !== undefined) {
    return Number(productStockCursor[productId] || 0);
  }

  const stock = await getProductStock(connection, shopId, productId);

  if (productStockCursor) {
    productStockCursor[productId] = stock;
  }

  return stock;
};

const setCursorValue = (productStockCursor, productId, value) => {
  if (productStockCursor) {
    productStockCursor[productId] = value;
  }
};

const allocateSaleBatches = async (
  connection,
  {
    shopId,
    productId,
    productName,
    quantity,
    saleId,
    saleItemId,
    userId,
    buyingPrice,
    productStockCursor,
  }
) => {
  const requestedQuantity = Number(quantity || 0);

  if (requestedQuantity <= 0) {
    return { tracked: false, allocations: [] };
  }

  const summary = await getBatchTrackingSummary(connection, shopId, productId);

  if (summary.batch_count === 0) {
    return { tracked: false, allocations: [] };
  }

  if (summary.available_quantity < requestedQuantity) {
    const error = new Error(`Not enough batch stock for ${productName || "product"}`);
    error.statusCode = 400;
    error.details = {
      product_id: productId,
      available_batch_stock: summary.available_quantity,
      requested_quantity: requestedQuantity,
    };
    throw error;
  }

  const [batches] = await connection.query(
    `SELECT id, batch_code, buying_price, quantity_remaining, expiry_date, received_date
     FROM stock_batches
     WHERE shop_id = ?
       AND product_id = ?
       AND status = 'active'
       AND quantity_remaining > 0
     ORDER BY
       CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC,
       expiry_date ASC,
       received_date ASC,
       id ASC
     FOR UPDATE`,
    [shopId, productId]
  );

  let remainingQuantity = requestedQuantity;
  const allocations = [];

  for (const batch of batches) {
    if (remainingQuantity <= 0) break;

    const previousBatchQuantity = Number(batch.quantity_remaining || 0);
    const quantityDeducted = Math.min(previousBatchQuantity, remainingQuantity);
    const newBatchQuantity = previousBatchQuantity - quantityDeducted;
    const previousStock = await ensureCursorValue(
      connection,
      productStockCursor,
      shopId,
      productId
    );
    const newStock = previousStock - quantityDeducted;
    const effectiveBuyingPrice = Number(batch.buying_price ?? buyingPrice ?? 0);

    if (newStock < 0) {
      const error = new Error(`Not enough stock for ${productName || "product"}`);
      error.statusCode = 400;
      throw error;
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

    await connection.query(
      `INSERT INTO sale_item_batches
       (shop_id, sale_id, sale_item_id, product_id, batch_id, quantity_deducted)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shopId, saleId, saleItemId, productId, batch.id, quantityDeducted]
    );

    await connection.query(
      `INSERT INTO stock_movements
       (shop_id, product_id, user_id, supplier_id, movement_type, quantity,
        previous_stock, new_stock, buying_price, total_cost, note,
        batch_id, reference_type, reference_id)
       VALUES (?, ?, ?, NULL, 'sale_batch_deduct', ?, ?, ?, ?, ?, ?, ?, 'sale', ?)`,
      [
        shopId,
        productId,
        userId,
        quantityDeducted,
        previousStock,
        newStock,
        effectiveBuyingPrice,
        formatMoney(quantityDeducted * effectiveBuyingPrice),
        `Batch stock deducted for sale ${saleId}`,
        batch.id,
        saleId,
      ]
    );

    setCursorValue(productStockCursor, productId, newStock);
    remainingQuantity -= quantityDeducted;

    allocations.push({
      batch_id: batch.id,
      batch_code: batch.batch_code,
      quantity_deducted: quantityDeducted,
      previous_batch_quantity: previousBatchQuantity,
      new_batch_quantity: newBatchQuantity,
      previous_stock: previousStock,
      new_stock: newStock,
    });
  }

  if (remainingQuantity > 0) {
    const error = new Error(`Not enough batch stock for ${productName || "product"}`);
    error.statusCode = 400;
    error.details = {
      product_id: productId,
      available_batch_stock: requestedQuantity - remainingQuantity,
      requested_quantity: requestedQuantity,
    };
    throw error;
  }

  return { tracked: true, allocations };
};

const getAllocationSummary = async (
  connection,
  shopId,
  { saleId = null, saleItemId = null }
) => {
  const filters = ["shop_id = ?"];
  const params = [shopId];

  if (saleId) {
    filters.push("sale_id = ?");
    params.push(saleId);
  }

  if (saleItemId) {
    filters.push("sale_item_id = ?");
    params.push(saleItemId);
  }

  const [rows] = await connection.query(
    `SELECT COUNT(*) AS allocation_count,
            COALESCE(SUM(quantity_deducted - quantity_restored), 0) AS remaining_quantity
     FROM sale_item_batches
     WHERE ${filters.join(" AND ")}`,
    params
  );

  return {
    allocation_count: Number(rows[0]?.allocation_count || 0),
    remaining_quantity: Number(rows[0]?.remaining_quantity || 0),
  };
};

const restoreSaleBatches = async (
  connection,
  {
    shopId,
    saleId = null,
    saleItemId = null,
    quantity = null,
    userId,
    productStockCursor,
    movementType = "return_batch_restore",
    referenceType = "return",
    referenceId = null,
    note = null,
  }
) => {
  const requestedQuantity =
    quantity === null || quantity === undefined ? null : Number(quantity);

  if (!saleId && !saleItemId) {
    const error = new Error("saleId or saleItemId is required for batch restore");
    error.statusCode = 400;
    throw error;
  }

  if (requestedQuantity !== null && requestedQuantity <= 0) {
    return [];
  }

  const summary = await getAllocationSummary(connection, shopId, {
    saleId,
    saleItemId,
  });

  if (summary.allocation_count === 0) {
    return [];
  }

  if (requestedQuantity !== null && requestedQuantity > summary.remaining_quantity) {
    const error = new Error("Cannot restore more than the remaining batch allocation");
    error.statusCode = 400;
    error.details = {
      remaining_batch_restore_quantity: summary.remaining_quantity,
      requested_quantity: requestedQuantity,
    };
    throw error;
  }

  const filters = [
    "sale_item_batches.shop_id = ?",
    "sale_item_batches.quantity_restored < sale_item_batches.quantity_deducted",
  ];
  const params = [shopId];

  if (saleId) {
    filters.push("sale_item_batches.sale_id = ?");
    params.push(saleId);
  }

  if (saleItemId) {
    filters.push("sale_item_batches.sale_item_id = ?");
    params.push(saleItemId);
  }

  const [allocations] = await connection.query(
    `SELECT sale_item_batches.id, sale_item_batches.sale_id,
            sale_item_batches.sale_item_id, sale_item_batches.product_id,
            sale_item_batches.batch_id, sale_item_batches.quantity_deducted,
            sale_item_batches.quantity_restored,
            stock_batches.batch_code, stock_batches.quantity_remaining,
            stock_batches.buying_price
     FROM sale_item_batches
     INNER JOIN stock_batches
       ON stock_batches.id = sale_item_batches.batch_id
      AND stock_batches.shop_id = sale_item_batches.shop_id
     WHERE ${filters.join(" AND ")}
     ORDER BY sale_item_batches.id ASC
     FOR UPDATE`,
    params
  );

  if (allocations.length === 0 && summary.remaining_quantity > 0) {
    const error = new Error("Cannot restore stock for missing batch allocation");
    error.statusCode = 409;
    throw error;
  }

  let remainingToRestore = requestedQuantity;
  const restoredAllocations = [];

  for (const allocation of allocations) {
    if (remainingToRestore !== null && remainingToRestore <= 0) break;

    const remainingAllocation =
      Number(allocation.quantity_deducted || 0) -
      Number(allocation.quantity_restored || 0);
    const quantityToRestore =
      remainingToRestore === null
        ? remainingAllocation
        : Math.min(remainingAllocation, remainingToRestore);

    if (quantityToRestore <= 0) continue;

    const previousBatchQuantity = Number(allocation.quantity_remaining || 0);
    const newBatchQuantity = previousBatchQuantity + quantityToRestore;
    const previousStock = await ensureCursorValue(
      connection,
      productStockCursor,
      shopId,
      allocation.product_id
    );
    const newStock = previousStock + quantityToRestore;
    const buyingPrice = Number(allocation.buying_price || 0);

    await connection.query(
      `UPDATE stock_batches
       SET quantity_remaining = ?,
           status = 'active'
       WHERE id = ? AND shop_id = ?`,
      [newBatchQuantity, allocation.batch_id, shopId]
    );

    await connection.query(
      `UPDATE sale_item_batches
       SET quantity_restored = quantity_restored + ?
       WHERE id = ? AND shop_id = ?`,
      [quantityToRestore, allocation.id, shopId]
    );

    await connection.query(
      `INSERT INTO stock_movements
       (shop_id, product_id, user_id, supplier_id, movement_type, quantity,
        previous_stock, new_stock, buying_price, total_cost, note,
        batch_id, reference_type, reference_id)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        allocation.product_id,
        userId,
        movementType,
        quantityToRestore,
        previousStock,
        newStock,
        buyingPrice,
        formatMoney(quantityToRestore * buyingPrice),
        note,
        allocation.batch_id,
        referenceType,
        referenceId,
      ]
    );

    setCursorValue(productStockCursor, allocation.product_id, newStock);

    if (remainingToRestore !== null) {
      remainingToRestore -= quantityToRestore;
    }

    restoredAllocations.push({
      sale_item_batch_id: allocation.id,
      sale_item_id: allocation.sale_item_id,
      product_id: allocation.product_id,
      batch_id: allocation.batch_id,
      batch_code: allocation.batch_code,
      quantity_restored: quantityToRestore,
      previous_batch_quantity: previousBatchQuantity,
      new_batch_quantity: newBatchQuantity,
      previous_stock: previousStock,
      new_stock: newStock,
    });
  }

  if (remainingToRestore !== null && remainingToRestore > 0) {
    const error = new Error("Cannot restore more than the remaining batch allocation");
    error.statusCode = 400;
    throw error;
  }

  return restoredAllocations;
};

module.exports = {
  allocateSaleBatches,
  restoreSaleBatches,
};
