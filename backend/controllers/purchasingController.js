const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");
const { ensurePurchasingSchema } = require("../utils/purchasingSchema");

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

const formatMoney = (value) => Number(Number(value || 0).toFixed(2));

const formatDate = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDatePart = (date = new Date()) => formatDate(date).replace(/-/g, "");

const formatPurchaseOrder = (order) => ({
  ...order,
  total_ordered_quantity: Number(order.total_ordered_quantity || 0),
  total_received_quantity: Number(order.total_received_quantity || 0),
  total_amount: Number(order.total_amount || 0),
});

const formatPurchaseOrderItem = (item) => ({
  ...item,
  ordered_quantity: Number(item.ordered_quantity || 0),
  received_quantity: Number(item.received_quantity || 0),
  remaining_quantity:
    Number(item.ordered_quantity || 0) - Number(item.received_quantity || 0),
  buying_price: Number(item.buying_price || 0),
  selling_price: item.selling_price === null ? null : Number(item.selling_price || 0),
});

const formatGrn = (grn) => ({
  ...grn,
  total_received_quantity: Number(grn.total_received_quantity || 0),
  total_amount: Number(grn.total_amount || 0),
});

const formatGrnItem = (item) => ({
  ...item,
  received_quantity: Number(item.received_quantity || 0),
  buying_price: Number(item.buying_price || 0),
  selling_price: item.selling_price === null ? null : Number(item.selling_price || 0),
});

const formatBatch = (batch) => ({
  ...batch,
  buying_price: Number(batch.buying_price || 0),
  selling_price: batch.selling_price === null ? null : Number(batch.selling_price || 0),
  quantity_received: Number(batch.quantity_received || 0),
  quantity_remaining: Number(batch.quantity_remaining || 0),
});

const generateReference = (prefix, id, date = new Date()) =>
  `${prefix}-${formatDatePart(date)}-${String(id).padStart(4, "0")}`;

const validatePurchaseOrderBody = (body) => {
  const errors = [];

  if (!isPositiveInteger(body.supplier_id)) {
    errors.push("supplier_id must be a positive integer");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("items must be a non-empty array");
    return errors;
  }

  const productIds = new Set();

  body.items.forEach((item, index) => {
    if (!isPositiveInteger(item.product_id)) {
      errors.push(`items[${index}].product_id must be a positive integer`);
    }

    if (isPositiveInteger(item.product_id)) {
      if (productIds.has(Number(item.product_id))) {
        errors.push(`items[${index}].product_id is duplicated`);
      }
      productIds.add(Number(item.product_id));
    }

    if (!isPositiveInteger(item.ordered_quantity)) {
      errors.push(`items[${index}].ordered_quantity must be greater than 0`);
    }

    if (!isNonNegativeNumber(item.buying_price)) {
      errors.push(`items[${index}].buying_price must be greater than or equal to 0`);
    }

    if (
      item.selling_price !== undefined &&
      item.selling_price !== null &&
      item.selling_price !== "" &&
      !isNonNegativeNumber(item.selling_price)
    ) {
      errors.push(`items[${index}].selling_price must be greater than or equal to 0`);
    }
  });

  return errors;
};

const validateGrnBody = (body) => {
  const errors = [];

  if (!isPositiveInteger(body.purchase_order_id)) {
    errors.push("purchase_order_id must be a positive integer");
  }

  if (!optionalText(body.supplier_invoice_number)) {
    errors.push("supplier_invoice_number is required");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("items must be a non-empty array");
    return errors;
  }

  const poItemIds = new Set();

  body.items.forEach((item, index) => {
    if (!isPositiveInteger(item.purchase_order_item_id)) {
      errors.push(`items[${index}].purchase_order_item_id must be a positive integer`);
    }

    if (isPositiveInteger(item.purchase_order_item_id)) {
      if (poItemIds.has(Number(item.purchase_order_item_id))) {
        errors.push(`items[${index}].purchase_order_item_id is duplicated`);
      }
      poItemIds.add(Number(item.purchase_order_item_id));
    }

    if (!isPositiveInteger(item.received_quantity)) {
      errors.push(`items[${index}].received_quantity must be greater than 0`);
    }

    if (
      item.buying_price !== undefined &&
      item.buying_price !== null &&
      item.buying_price !== "" &&
      !isNonNegativeNumber(item.buying_price)
    ) {
      errors.push(`items[${index}].buying_price must be greater than or equal to 0`);
    }

    if (
      item.selling_price !== undefined &&
      item.selling_price !== null &&
      item.selling_price !== "" &&
      !isNonNegativeNumber(item.selling_price)
    ) {
      errors.push(`items[${index}].selling_price must be greater than or equal to 0`);
    }
  });

  return errors;
};

const assertSupplierInShop = async (connection, shopId, supplierId) => {
  const [suppliers] = await connection.query(
    "SELECT id, supplier_name FROM suppliers WHERE id = ? AND shop_id = ? LIMIT 1",
    [supplierId, shopId]
  );

  return suppliers[0] || null;
};

const getProductMap = async (connection, shopId, productIds, forUpdate = false) => {
  const lockClause = forUpdate ? " FOR UPDATE" : "";
  const [products] = await connection.query(
    `SELECT id, product_name, buying_price, wholesale_price, selling_price,
            stock_quantity
     FROM products
     WHERE shop_id = ? AND id IN (?)${lockClause}`,
    [shopId, productIds]
  );

  return products.reduce((map, product) => {
    map[product.id] = product;
    return map;
  }, {});
};

const normalizePurchaseOrderItems = (items, productMap) =>
  items.map((item) => {
    const product = productMap[Number(item.product_id)];
    return {
      product_id: Number(item.product_id),
      ordered_quantity: Number(item.ordered_quantity),
      buying_price: formatMoney(Number(item.buying_price)),
      selling_price:
        item.selling_price === undefined || item.selling_price === null || item.selling_price === ""
          ? product?.selling_price ?? null
          : formatMoney(Number(item.selling_price)),
      notes: optionalText(item.notes),
    };
  });

const loadPurchaseOrderDetail = async (connection, shopId, orderId) => {
  const [orders] = await connection.query(
    `SELECT purchase_orders.*, suppliers.supplier_name,
            COALESCE(item_summary.total_ordered_quantity, 0) AS total_ordered_quantity,
            COALESCE(item_summary.total_received_quantity, 0) AS total_received_quantity,
            COALESCE(item_summary.total_amount, 0) AS total_amount
     FROM purchase_orders
     INNER JOIN suppliers
       ON suppliers.id = purchase_orders.supplier_id
      AND suppliers.shop_id = purchase_orders.shop_id
     LEFT JOIN (
       SELECT shop_id, purchase_order_id,
              SUM(ordered_quantity) AS total_ordered_quantity,
              SUM(received_quantity) AS total_received_quantity,
              SUM(ordered_quantity * buying_price) AS total_amount
       FROM purchase_order_items
       GROUP BY shop_id, purchase_order_id
     ) AS item_summary
       ON item_summary.purchase_order_id = purchase_orders.id
      AND item_summary.shop_id = purchase_orders.shop_id
     WHERE purchase_orders.shop_id = ? AND purchase_orders.id = ?
     LIMIT 1`,
    [shopId, orderId]
  );

  if (orders.length === 0) return null;

  const [items] = await connection.query(
    `SELECT purchase_order_items.*, products.product_name, products.product_code,
            products.barcode
     FROM purchase_order_items
     INNER JOIN products
       ON products.id = purchase_order_items.product_id
      AND products.shop_id = purchase_order_items.shop_id
     WHERE purchase_order_items.shop_id = ?
       AND purchase_order_items.purchase_order_id = ?
     ORDER BY purchase_order_items.id ASC`,
    [shopId, orderId]
  );

  return {
    ...formatPurchaseOrder(orders[0]),
    items: items.map(formatPurchaseOrderItem),
  };
};

const loadGrnDetail = async (connection, shopId, grnId) => {
  const [grns] = await connection.query(
    `SELECT goods_received_notes.*, purchase_orders.po_number,
            suppliers.supplier_name,
            COALESCE(item_summary.total_received_quantity, 0) AS total_received_quantity,
            COALESCE(item_summary.total_amount, 0) AS total_amount
     FROM goods_received_notes
     INNER JOIN purchase_orders
       ON purchase_orders.id = goods_received_notes.purchase_order_id
      AND purchase_orders.shop_id = goods_received_notes.shop_id
     INNER JOIN suppliers
       ON suppliers.id = goods_received_notes.supplier_id
      AND suppliers.shop_id = goods_received_notes.shop_id
     LEFT JOIN (
       SELECT shop_id, grn_id,
              SUM(received_quantity) AS total_received_quantity,
              SUM(received_quantity * buying_price) AS total_amount
       FROM grn_items
       GROUP BY shop_id, grn_id
     ) AS item_summary
       ON item_summary.grn_id = goods_received_notes.id
      AND item_summary.shop_id = goods_received_notes.shop_id
     WHERE goods_received_notes.shop_id = ? AND goods_received_notes.id = ?
     LIMIT 1`,
    [shopId, grnId]
  );

  if (grns.length === 0) return null;

  const [items] = await connection.query(
    `SELECT grn_items.*, products.product_name, products.product_code,
            purchase_order_items.ordered_quantity,
            purchase_order_items.received_quantity AS po_received_quantity
     FROM grn_items
     INNER JOIN products
       ON products.id = grn_items.product_id
      AND products.shop_id = grn_items.shop_id
     INNER JOIN purchase_order_items
       ON purchase_order_items.id = grn_items.purchase_order_item_id
      AND purchase_order_items.shop_id = grn_items.shop_id
     WHERE grn_items.shop_id = ? AND grn_items.grn_id = ?
     ORDER BY grn_items.id ASC`,
    [shopId, grnId]
  );

  return {
    ...formatGrn(grns[0]),
    items: items.map(formatGrnItem),
  };
};

const updatePurchaseOrderStatusAfterReceive = async (connection, shopId, orderId) => {
  const [rows] = await connection.query(
    `SELECT
       SUM(CASE WHEN received_quantity >= ordered_quantity THEN 1 ELSE 0 END) AS complete_count,
       COUNT(*) AS item_count,
       COALESCE(SUM(received_quantity), 0) AS received_total
     FROM purchase_order_items
     WHERE shop_id = ? AND purchase_order_id = ?`,
    [shopId, orderId]
  );

  const summary = rows[0] || {};
  const itemCount = Number(summary.item_count || 0);
  const completeCount = Number(summary.complete_count || 0);
  const receivedTotal = Number(summary.received_total || 0);
  const nextStatus =
    itemCount > 0 && completeCount === itemCount ? "received" : "partially_received";

  await connection.query(
    `UPDATE purchase_orders
     SET status = ?
     WHERE id = ? AND shop_id = ? AND status <> 'cancelled'`,
    [receivedTotal > 0 ? nextStatus : "ordered", orderId, shopId]
  );

  return nextStatus;
};

exports.getPurchaseOrders = async (req, res) => {
  try {
    await ensurePurchasingSchema();

    const [orders] = await db.promise().query(
      `SELECT purchase_orders.*, suppliers.supplier_name,
              COALESCE(item_summary.total_ordered_quantity, 0) AS total_ordered_quantity,
              COALESCE(item_summary.total_received_quantity, 0) AS total_received_quantity,
              COALESCE(item_summary.total_amount, 0) AS total_amount
       FROM purchase_orders
       INNER JOIN suppliers
         ON suppliers.id = purchase_orders.supplier_id
        AND suppliers.shop_id = purchase_orders.shop_id
       LEFT JOIN (
         SELECT shop_id, purchase_order_id,
                SUM(ordered_quantity) AS total_ordered_quantity,
                SUM(received_quantity) AS total_received_quantity,
                SUM(ordered_quantity * buying_price) AS total_amount
         FROM purchase_order_items
         GROUP BY shop_id, purchase_order_id
       ) AS item_summary
         ON item_summary.purchase_order_id = purchase_orders.id
        AND item_summary.shop_id = purchase_orders.shop_id
       WHERE purchase_orders.shop_id = ?
       ORDER BY purchase_orders.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Purchase orders fetched successfully",
      purchase_orders: orders.map(formatPurchaseOrder),
    });
  } catch (error) {
    console.error("Get purchase orders error:", error.message);
    return res.status(500).json({ message: "Server error while fetching purchase orders" });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  const errors = validatePurchaseOrderBody(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  const shopId = req.user.shop_id;
  const connection = db.promise();

  try {
    await ensurePurchasingSchema();
    await connection.beginTransaction();

    const supplier = await assertSupplierInShop(connection, shopId, req.body.supplier_id);

    if (!supplier) {
      await connection.rollback();
      return res.status(404).json({ message: "Supplier not found" });
    }

    const productIds = req.body.items.map((item) => Number(item.product_id));
    const productMap = await getProductMap(connection, shopId, productIds);

    if (Object.keys(productMap).length !== productIds.length) {
      await connection.rollback();
      return res.status(404).json({ message: "One or more products were not found" });
    }

    const [orderResult] = await connection.query(
      `INSERT INTO purchase_orders
       (shop_id, supplier_id, status, expected_date, notes, created_by)
       VALUES (?, ?, 'draft', ?, ?, ?)`,
      [
        shopId,
        Number(req.body.supplier_id),
        formatDate(req.body.expected_date),
        optionalText(req.body.notes),
        req.user.id,
      ]
    );

    const orderId = orderResult.insertId;
    const poNumber = generateReference("PO", orderId);
    const itemRows = normalizePurchaseOrderItems(req.body.items, productMap).map((item) => [
      orderId,
      shopId,
      item.product_id,
      item.ordered_quantity,
      0,
      item.buying_price,
      item.selling_price,
      item.notes,
    ]);

    await connection.query("UPDATE purchase_orders SET po_number = ? WHERE id = ? AND shop_id = ?", [
      poNumber,
      orderId,
      shopId,
    ]);

    await connection.query(
      `INSERT INTO purchase_order_items
       (purchase_order_id, shop_id, product_id, ordered_quantity,
        received_quantity, buying_price, selling_price, notes)
       VALUES ?`,
      [itemRows]
    );

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "purchase_order_create",
      entity_type: "purchase_order",
      entity_id: orderId,
      description: `Created purchase order ${poNumber}`,
    });

    const purchaseOrder = await loadPurchaseOrderDetail(db.promise(), shopId, orderId);
    return res.status(201).json({
      message: "Purchase order created successfully",
      purchase_order: purchaseOrder,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Create purchase order rollback failed:", rollbackError.message);
    }

    console.error("Create purchase order error:", error.message);
    return res.status(500).json({ message: "Server error while creating purchase order" });
  }
};

exports.getPurchaseOrderById = async (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ message: "Valid purchase order id is required" });
  }

  try {
    await ensurePurchasingSchema();
    const purchaseOrder = await loadPurchaseOrderDetail(
      db.promise(),
      req.user.shop_id,
      Number(req.params.id)
    );

    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase order not found" });
    }

    return res.json({
      message: "Purchase order fetched successfully",
      purchase_order: purchaseOrder,
    });
  } catch (error) {
    console.error("Get purchase order error:", error.message);
    return res.status(500).json({ message: "Server error while fetching purchase order" });
  }
};

exports.updatePurchaseOrder = async (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ message: "Valid purchase order id is required" });
  }

  const errors = validatePurchaseOrderBody(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  const shopId = req.user.shop_id;
  const orderId = Number(req.params.id);
  const connection = db.promise();

  try {
    await ensurePurchasingSchema();
    await connection.beginTransaction();

    const [orders] = await connection.query(
      "SELECT id, status FROM purchase_orders WHERE id = ? AND shop_id = ? LIMIT 1 FOR UPDATE",
      [orderId, shopId]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Purchase order not found" });
    }

    if (orders[0].status !== "draft") {
      await connection.rollback();
      return res.status(409).json({ message: "Only draft purchase orders can be edited" });
    }

    const supplier = await assertSupplierInShop(connection, shopId, req.body.supplier_id);

    if (!supplier) {
      await connection.rollback();
      return res.status(404).json({ message: "Supplier not found" });
    }

    const productIds = req.body.items.map((item) => Number(item.product_id));
    const productMap = await getProductMap(connection, shopId, productIds);

    if (Object.keys(productMap).length !== productIds.length) {
      await connection.rollback();
      return res.status(404).json({ message: "One or more products were not found" });
    }

    await connection.query(
      `UPDATE purchase_orders
       SET supplier_id = ?, expected_date = ?, notes = ?
       WHERE id = ? AND shop_id = ?`,
      [
        Number(req.body.supplier_id),
        formatDate(req.body.expected_date),
        optionalText(req.body.notes),
        orderId,
        shopId,
      ]
    );

    await connection.query(
      "DELETE FROM purchase_order_items WHERE purchase_order_id = ? AND shop_id = ?",
      [orderId, shopId]
    );

    const itemRows = normalizePurchaseOrderItems(req.body.items, productMap).map((item) => [
      orderId,
      shopId,
      item.product_id,
      item.ordered_quantity,
      0,
      item.buying_price,
      item.selling_price,
      item.notes,
    ]);

    await connection.query(
      `INSERT INTO purchase_order_items
       (purchase_order_id, shop_id, product_id, ordered_quantity,
        received_quantity, buying_price, selling_price, notes)
       VALUES ?`,
      [itemRows]
    );

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "purchase_order_update",
      entity_type: "purchase_order",
      entity_id: orderId,
      description: `Updated purchase order ${orderId}`,
    });

    const purchaseOrder = await loadPurchaseOrderDetail(db.promise(), shopId, orderId);
    return res.json({
      message: "Purchase order updated successfully",
      purchase_order: purchaseOrder,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Update purchase order rollback failed:", rollbackError.message);
    }

    console.error("Update purchase order error:", error.message);
    return res.status(500).json({ message: "Server error while updating purchase order" });
  }
};

exports.submitPurchaseOrder = async (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ message: "Valid purchase order id is required" });
  }

  try {
    await ensurePurchasingSchema();

    const [orders] = await db.promise().query(
      `SELECT purchase_orders.id, purchase_orders.po_number, purchase_orders.status,
              COALESCE(item_summary.item_count, 0) AS item_count
       FROM purchase_orders
       LEFT JOIN (
         SELECT shop_id, purchase_order_id, COUNT(*) AS item_count
         FROM purchase_order_items
         GROUP BY shop_id, purchase_order_id
       ) AS item_summary
         ON item_summary.purchase_order_id = purchase_orders.id
        AND item_summary.shop_id = purchase_orders.shop_id
       WHERE purchase_orders.id = ? AND purchase_orders.shop_id = ?
       LIMIT 1`,
      [Number(req.params.id), req.user.shop_id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: "Purchase order not found" });
    }

    if (orders[0].status !== "draft") {
      return res.status(409).json({ message: "Only draft purchase orders can be submitted" });
    }

    if (Number(orders[0].item_count || 0) === 0) {
      return res.status(400).json({ message: "Purchase order has no items" });
    }

    await db.promise().query(
      `UPDATE purchase_orders
       SET status = 'ordered', submitted_by = ?, submitted_at = NOW()
       WHERE id = ? AND shop_id = ?`,
      [req.user.id, Number(req.params.id), req.user.shop_id]
    );

    await createAuditLogFromRequest(req, {
      action: "purchase_order_submit",
      entity_type: "purchase_order",
      entity_id: Number(req.params.id),
      description: `Submitted purchase order ${orders[0].po_number || req.params.id}`,
    });

    const purchaseOrder = await loadPurchaseOrderDetail(
      db.promise(),
      req.user.shop_id,
      Number(req.params.id)
    );
    return res.json({
      message: "Purchase order submitted successfully",
      purchase_order: purchaseOrder,
    });
  } catch (error) {
    console.error("Submit purchase order error:", error.message);
    return res.status(500).json({ message: "Server error while submitting purchase order" });
  }
};

exports.cancelPurchaseOrder = async (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ message: "Valid purchase order id is required" });
  }

  try {
    await ensurePurchasingSchema();

    const [orders] = await db.promise().query(
      "SELECT id, po_number, status FROM purchase_orders WHERE id = ? AND shop_id = ? LIMIT 1",
      [Number(req.params.id), req.user.shop_id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: "Purchase order not found" });
    }

    if (!["draft", "ordered"].includes(orders[0].status)) {
      return res.status(409).json({
        message: "Only draft or ordered purchase orders can be cancelled",
      });
    }

    await db.promise().query(
      `UPDATE purchase_orders
       SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW()
       WHERE id = ? AND shop_id = ?`,
      [req.user.id, Number(req.params.id), req.user.shop_id]
    );

    await createAuditLogFromRequest(req, {
      action: "purchase_order_cancel",
      entity_type: "purchase_order",
      entity_id: Number(req.params.id),
      description: `Cancelled purchase order ${orders[0].po_number || req.params.id}`,
    });

    const purchaseOrder = await loadPurchaseOrderDetail(
      db.promise(),
      req.user.shop_id,
      Number(req.params.id)
    );
    return res.json({
      message: "Purchase order cancelled successfully",
      purchase_order: purchaseOrder,
    });
  } catch (error) {
    console.error("Cancel purchase order error:", error.message);
    return res.status(500).json({ message: "Server error while cancelling purchase order" });
  }
};

exports.getGrns = async (req, res) => {
  try {
    await ensurePurchasingSchema();

    const [grns] = await db.promise().query(
      `SELECT goods_received_notes.*, purchase_orders.po_number,
              suppliers.supplier_name,
              COALESCE(item_summary.total_received_quantity, 0) AS total_received_quantity,
              COALESCE(item_summary.total_amount, 0) AS total_amount
       FROM goods_received_notes
       INNER JOIN purchase_orders
         ON purchase_orders.id = goods_received_notes.purchase_order_id
        AND purchase_orders.shop_id = goods_received_notes.shop_id
       INNER JOIN suppliers
         ON suppliers.id = goods_received_notes.supplier_id
        AND suppliers.shop_id = goods_received_notes.shop_id
       LEFT JOIN (
         SELECT shop_id, grn_id,
                SUM(received_quantity) AS total_received_quantity,
                SUM(received_quantity * buying_price) AS total_amount
         FROM grn_items
         GROUP BY shop_id, grn_id
       ) AS item_summary
         ON item_summary.grn_id = goods_received_notes.id
        AND item_summary.shop_id = goods_received_notes.shop_id
       WHERE goods_received_notes.shop_id = ?
       ORDER BY goods_received_notes.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "GRNs fetched successfully",
      grns: grns.map(formatGrn),
    });
  } catch (error) {
    console.error("Get GRNs error:", error.message);
    return res.status(500).json({ message: "Server error while fetching GRNs" });
  }
};

exports.createGrn = async (req, res) => {
  const errors = validateGrnBody(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  const shopId = req.user.shop_id;
  const connection = db.promise();

  try {
    await ensurePurchasingSchema();
    await connection.beginTransaction();

    const [orders] = await connection.query(
      `SELECT id, supplier_id, status, po_number
       FROM purchase_orders
       WHERE id = ? AND shop_id = ?
       LIMIT 1
       FOR UPDATE`,
      [Number(req.body.purchase_order_id), shopId]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Purchase order not found" });
    }

    const order = orders[0];

    if (!["ordered", "partially_received"].includes(order.status)) {
      await connection.rollback();
      return res.status(409).json({
        message: "GRNs can only be created for ordered purchase orders",
      });
    }

    const poItemIds = req.body.items.map((item) => Number(item.purchase_order_item_id));
    const [poItems] = await connection.query(
      `SELECT purchase_order_items.*, products.product_name, products.selling_price
       FROM purchase_order_items
       INNER JOIN products
         ON products.id = purchase_order_items.product_id
        AND products.shop_id = purchase_order_items.shop_id
       WHERE purchase_order_items.shop_id = ?
         AND purchase_order_items.purchase_order_id = ?
         AND purchase_order_items.id IN (?)`,
      [shopId, order.id, poItemIds]
    );

    if (poItems.length !== poItemIds.length) {
      await connection.rollback();
      return res.status(404).json({ message: "One or more purchase order items were not found" });
    }

    const poItemMap = poItems.reduce((map, item) => {
      map[item.id] = item;
      return map;
    }, {});

    const grnItemRows = [];

    for (const item of req.body.items) {
      const poItem = poItemMap[Number(item.purchase_order_item_id)];
      const receivedQuantity = Number(item.received_quantity);
      const remainingQuantity =
        Number(poItem.ordered_quantity || 0) - Number(poItem.received_quantity || 0);

      if (receivedQuantity > remainingQuantity) {
        await connection.rollback();
        return res.status(400).json({
          message: `Cannot receive more than ordered quantity for ${poItem.product_name}`,
          product_id: poItem.product_id,
          remaining_quantity: Math.max(remainingQuantity, 0),
        });
      }

      grnItemRows.push([
        null,
        shopId,
        poItem.id,
        poItem.product_id,
        receivedQuantity,
        item.buying_price === undefined || item.buying_price === null || item.buying_price === ""
          ? formatMoney(poItem.buying_price)
          : formatMoney(Number(item.buying_price)),
        item.selling_price === undefined || item.selling_price === null || item.selling_price === ""
          ? poItem.selling_price ?? null
          : formatMoney(Number(item.selling_price)),
        formatDate(item.expiry_date),
        optionalText(item.batch_code),
      ]);
    }

    const receivedDate = formatDate(req.body.received_date) || formatDate(new Date());
    const supplierInvoiceNumber = optionalText(req.body.supplier_invoice_number);
    const [grnResult] = await connection.query(
      `INSERT INTO goods_received_notes
       (shop_id, purchase_order_id, supplier_id, supplier_invoice_number,
        received_date, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [
        shopId,
        order.id,
        order.supplier_id,
        supplierInvoiceNumber,
        receivedDate,
        optionalText(req.body.notes),
        req.user.id,
      ]
    );

    const grnId = grnResult.insertId;
    const grnNumber = generateReference("GRN", grnId, receivedDate);

    await connection.query(
      "UPDATE goods_received_notes SET grn_number = ? WHERE id = ? AND shop_id = ?",
      [grnNumber, grnId, shopId]
    );

    await connection.query(
      `INSERT INTO grn_items
       (grn_id, shop_id, purchase_order_item_id, product_id, received_quantity,
        buying_price, selling_price, expiry_date, batch_code)
       VALUES ?`,
      [grnItemRows.map((row) => [grnId, ...row.slice(1)])]
    );

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "grn_create",
      entity_type: "grn",
      entity_id: grnId,
      description: `Created GRN ${grnNumber} for purchase order ${order.po_number || order.id}`,
    });

    const grn = await loadGrnDetail(db.promise(), shopId, grnId);
    return res.status(201).json({
      message: "GRN created successfully",
      grn,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Create GRN rollback failed:", rollbackError.message);
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Supplier invoice number already exists for this supplier",
      });
    }

    console.error("Create GRN error:", error.message);
    return res.status(500).json({ message: "Server error while creating GRN" });
  }
};

exports.getGrnById = async (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ message: "Valid GRN id is required" });
  }

  try {
    await ensurePurchasingSchema();
    const grn = await loadGrnDetail(db.promise(), req.user.shop_id, Number(req.params.id));

    if (!grn) {
      return res.status(404).json({ message: "GRN not found" });
    }

    return res.json({ message: "GRN fetched successfully", grn });
  } catch (error) {
    console.error("Get GRN error:", error.message);
    return res.status(500).json({ message: "Server error while fetching GRN" });
  }
};

exports.postGrn = async (req, res) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({ message: "Valid GRN id is required" });
  }

  const shopId = req.user.shop_id;
  const grnId = Number(req.params.id);
  const connection = db.promise();

  try {
    await ensurePurchasingSchema();
    await connection.beginTransaction();

    const [grns] = await connection.query(
      `SELECT goods_received_notes.*, purchase_orders.status AS purchase_order_status
       FROM goods_received_notes
       INNER JOIN purchase_orders
         ON purchase_orders.id = goods_received_notes.purchase_order_id
        AND purchase_orders.shop_id = goods_received_notes.shop_id
       WHERE goods_received_notes.id = ?
         AND goods_received_notes.shop_id = ?
       LIMIT 1
       FOR UPDATE`,
      [grnId, shopId]
    );

    if (grns.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "GRN not found" });
    }

    const grn = grns[0];

    if (grn.status !== "draft") {
      await connection.rollback();
      return res.status(409).json({ message: "GRN has already been posted" });
    }

    if (!["ordered", "partially_received"].includes(grn.purchase_order_status)) {
      await connection.rollback();
      return res.status(409).json({
        message: "GRN cannot be posted for this purchase order status",
      });
    }

    const [items] = await connection.query(
      `SELECT grn_items.*, purchase_order_items.ordered_quantity,
              purchase_order_items.received_quantity AS po_received_quantity,
              products.product_name, products.stock_quantity,
              products.buying_price AS current_buying_price,
              products.wholesale_price AS current_wholesale_price,
              products.selling_price AS current_selling_price
       FROM grn_items
       INNER JOIN purchase_order_items
         ON purchase_order_items.id = grn_items.purchase_order_item_id
        AND purchase_order_items.shop_id = grn_items.shop_id
       INNER JOIN products
         ON products.id = grn_items.product_id
        AND products.shop_id = grn_items.shop_id
       WHERE grn_items.grn_id = ?
         AND grn_items.shop_id = ?
       ORDER BY grn_items.id ASC
       FOR UPDATE`,
      [grnId, shopId]
    );

    if (items.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "GRN has no items" });
    }

    for (const item of items) {
      const remainingQuantity =
        Number(item.ordered_quantity || 0) - Number(item.po_received_quantity || 0);

      if (Number(item.received_quantity || 0) > remainingQuantity) {
        await connection.rollback();
        return res.status(400).json({
          message: `Cannot receive more than ordered quantity for ${item.product_name}`,
          product_id: item.product_id,
          remaining_quantity: Math.max(remainingQuantity, 0),
        });
      }
    }

    const postedBatches = [];

    for (const [index, item] of items.entries()) {
      const quantity = Number(item.received_quantity || 0);
      const previousStock = Number(item.stock_quantity || 0);
      const newStock = previousStock + quantity;
      const buyingPrice = formatMoney(item.buying_price);
      const sellingPrice =
        item.selling_price === null || item.selling_price === undefined
          ? item.current_selling_price
          : item.selling_price;
      const batchCode =
        optionalText(item.batch_code) ||
        `${grn.grn_number || generateReference("GRN", grn.id)}-${String(index + 1).padStart(2, "0")}`;

      await connection.query(
        `UPDATE products
         SET stock_quantity = ?,
             buying_price = ?,
             wholesale_price = ?
         WHERE id = ? AND shop_id = ?`,
        [newStock, buyingPrice, buyingPrice, item.product_id, shopId]
      );

      const [batchResult] = await connection.query(
        `INSERT INTO stock_batches
         (shop_id, product_id, supplier_id, purchase_order_id, grn_id,
          batch_code, buying_price, selling_price, quantity_received,
          quantity_remaining, expiry_date, supplier_invoice_number, received_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          shopId,
          item.product_id,
          grn.supplier_id,
          grn.purchase_order_id,
          grn.id,
          batchCode,
          buyingPrice,
          sellingPrice === null || sellingPrice === undefined ? null : formatMoney(sellingPrice),
          quantity,
          quantity,
          item.expiry_date || null,
          grn.supplier_invoice_number,
          formatDate(grn.received_date),
        ]
      );

      const batchId = batchResult.insertId;

      await connection.query(
        `UPDATE grn_items
         SET batch_code = ?
         WHERE id = ? AND shop_id = ?`,
        [batchCode, item.id, shopId]
      );

      await connection.query(
        `UPDATE purchase_order_items
         SET received_quantity = received_quantity + ?
         WHERE id = ? AND shop_id = ?`,
        [quantity, item.purchase_order_item_id, shopId]
      );

      await connection.query(
        `INSERT INTO stock_movements
         (shop_id, product_id, user_id, supplier_id, movement_type, quantity,
          previous_stock, new_stock, buying_price, total_cost, note,
          batch_id, reference_type, reference_id)
         VALUES (?, ?, ?, ?, 'grn_receive', ?, ?, ?, ?, ?, ?, ?, 'grn', ?)`,
        [
          shopId,
          item.product_id,
          req.user.id,
          grn.supplier_id,
          quantity,
          previousStock,
          newStock,
          buyingPrice,
          formatMoney(quantity * buyingPrice),
          `GRN ${grn.grn_number || grn.id} invoice ${grn.supplier_invoice_number}`,
          batchId,
          grn.id,
        ]
      );

      await connection.query(
        `INSERT INTO buying_price_history
         (shop_id, product_id, supplier_id, purchase_order_id, grn_id,
          old_buying_price, new_buying_price, selling_price, quantity_received,
          supplier_invoice_number, effective_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          item.product_id,
          grn.supplier_id,
          grn.purchase_order_id,
          grn.id,
          item.current_wholesale_price ?? item.current_buying_price ?? null,
          buyingPrice,
          sellingPrice === null || sellingPrice === undefined ? null : formatMoney(sellingPrice),
          quantity,
          grn.supplier_invoice_number,
          formatDate(grn.received_date),
          req.user.id,
        ]
      );

      postedBatches.push({
        batch_id: batchId,
        product_id: item.product_id,
        batch_code: batchCode,
        quantity_received: quantity,
        quantity_remaining: quantity,
        previous_stock: previousStock,
        new_stock: newStock,
      });
    }

    const purchaseOrderStatus = await updatePurchaseOrderStatusAfterReceive(
      connection,
      shopId,
      grn.purchase_order_id
    );

    await connection.query(
      `UPDATE goods_received_notes
       SET status = 'posted', posted_by = ?, posted_at = NOW()
       WHERE id = ? AND shop_id = ?`,
      [req.user.id, grn.id, shopId]
    );

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "grn_post",
      entity_type: "grn",
      entity_id: grn.id,
      description: `Posted GRN ${grn.grn_number || grn.id}`,
    });

    const postedGrn = await loadGrnDetail(db.promise(), shopId, grn.id);
    return res.json({
      message: "GRN posted successfully",
      grn: postedGrn,
      purchase_order_status: purchaseOrderStatus,
      batches: postedBatches,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Post GRN rollback failed:", rollbackError.message);
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Batch code or supplier invoice number already exists",
      });
    }

    console.error("Post GRN error:", error.message);
    return res.status(500).json({ message: "Server error while posting GRN" });
  }
};

exports.getProductBatches = async (req, res) => {
  if (!isPositiveInteger(req.params.productId)) {
    return res.status(400).json({ message: "Valid product id is required" });
  }

  const productId = Number(req.params.productId);

  try {
    await ensurePurchasingSchema();

    const [products] = await db.promise().query(
      "SELECT id FROM products WHERE id = ? AND shop_id = ? LIMIT 1",
      [productId, req.user.shop_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const [batches] = await db.promise().query(
      `SELECT stock_batches.*, suppliers.supplier_name,
              purchase_orders.po_number, goods_received_notes.grn_number
       FROM stock_batches
       INNER JOIN suppliers
         ON suppliers.id = stock_batches.supplier_id
        AND suppliers.shop_id = stock_batches.shop_id
       INNER JOIN purchase_orders
         ON purchase_orders.id = stock_batches.purchase_order_id
        AND purchase_orders.shop_id = stock_batches.shop_id
       INNER JOIN goods_received_notes
         ON goods_received_notes.id = stock_batches.grn_id
        AND goods_received_notes.shop_id = stock_batches.shop_id
       WHERE stock_batches.shop_id = ?
         AND stock_batches.product_id = ?
       ORDER BY stock_batches.received_date DESC, stock_batches.id DESC`,
      [req.user.shop_id, productId]
    );

    return res.json({
      message: "Product batches fetched successfully",
      batches: batches.map(formatBatch),
    });
  } catch (error) {
    console.error("Get product batches error:", error.message);
    return res.status(500).json({ message: "Server error while fetching product batches" });
  }
};
