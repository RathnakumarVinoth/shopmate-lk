const db = require("../config/db");
const {
  ensurePaymentVerificationTable,
  ensureSalesPaymentColumns,
  ensureStockMovementsTable,
} = require("../utils/paymentSchema");
const { createAuditLogFromRequest } = require("../utils/auditLog");
const { ensureSaleBatchSchema } = require("../utils/saleBatchSchema");
const { restoreSaleBatches } = require("../utils/saleBatchService");

const verifiablePaymentTypes = ["card", "bank_transfer", "qr"];

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const formatPayment = (payment) => {
  const paymentType = payment.payment_type || payment.payment_method;
  const amount = Number(payment.amount || payment.total_amount || 0);
  const paymentStatus =
    payment.payment_status || payment.verification_status || payment.status || "pending";
  const paymentReference = payment.payment_reference || payment.reference_no || null;

  return {
    ...payment,
    amount,
    total_amount: Number(payment.total_amount || amount),
    paid_amount: Number(payment.paid_amount || 0),
    customer_name: payment.customer_name || null,
    payment_type: paymentType,
    payment_method: payment.payment_method || paymentType,
    payment_status: paymentStatus,
    verification_status: payment.verification_status || payment.status || paymentStatus,
    payment_reference: paymentReference,
    reference_no: payment.reference_no || paymentReference,
    approval_code: payment.approval_code || null,
    card_last_four: payment.card_last_four || null,
    card_last4: payment.card_last_four || null,
  };
};

const validateVerificationFields = (body) => {
  const errors = [];

  if (
    body.card_last_four !== undefined &&
    body.card_last_four !== null &&
    body.card_last_four !== "" &&
    !/^\d{4}$/.test(String(body.card_last_four).trim())
  ) {
    errors.push("card_last_four must contain exactly 4 digits");
  }

  return errors;
};

const getReturnedQuantityByProduct = async (connection, shopId, saleId) => {
  const [returnTables] = await connection.query("SHOW TABLES LIKE 'sales_returns'");
  const [returnItemTables] = await connection.query(
    "SHOW TABLES LIKE 'sales_return_items'"
  );

  if (returnTables.length === 0 || returnItemTables.length === 0) return {};

  const [rows] = await connection.query(
    `SELECT sales_return_items.product_id,
            COALESCE(SUM(sales_return_items.quantity), 0) AS returned_quantity
     FROM sales_return_items
     INNER JOIN sales_returns
       ON sales_returns.id = sales_return_items.return_id
     WHERE sales_returns.shop_id = ?
       AND sales_returns.sale_id = ?
     GROUP BY sales_return_items.product_id`,
    [shopId, saleId]
  );

  return rows.reduce((map, row) => {
    map[row.product_id] = Number(row.returned_quantity || 0);
    return map;
  }, {});
};

const restoreStockForFailedSale = async (connection, sale, shopId, userId) => {
  if (sale.stock_restored_at) {
    return { restoredItems: [], restoredBatchItems: [] };
  }

  const returnedByProduct = await getReturnedQuantityByProduct(
    connection,
    shopId,
    sale.id
  );

  const [saleItems] = await connection.query(
    `SELECT sale_items.product_id, sale_items.quantity,
            products.product_name, products.stock_quantity, products.buying_price
     FROM sale_items
     LEFT JOIN products
       ON products.id = sale_items.product_id
      AND products.shop_id = ?
     WHERE sale_items.sale_id = ?
     FOR UPDATE`,
    [shopId, sale.id]
  );

  const restoreByProduct = saleItems.reduce((map, item) => {
    if (!map[item.product_id]) {
      map[item.product_id] = {
        product_id: item.product_id,
        product_name: item.product_name,
        stock_quantity: item.stock_quantity,
        buying_price: item.buying_price,
        quantity: 0,
      };
    }

    map[item.product_id].quantity += Number(item.quantity || 0);
    return map;
  }, {});

  const restoredItems = [];
  const saleLabel = sale.invoice_no || `sale ${sale.id}`;
  const productStockCursor = Object.values(restoreByProduct).reduce((map, item) => {
    map[item.product_id] = Number(item.stock_quantity || 0);
    return map;
  }, {});
  const restoredBatchItems = await restoreSaleBatches(connection, {
    shopId,
    saleId: sale.id,
    userId,
    productStockCursor,
    movementType: "payment_failed_batch_restore",
    referenceType: "sale",
    referenceId: sale.id,
    note: `Payment failed batch stock restore for ${saleLabel}`,
  });

  for (const item of Object.values(restoreByProduct)) {
    const alreadyReturnedQuantity = Number(returnedByProduct[item.product_id] || 0);
    const previousStock = Number(item.stock_quantity || 0);
    const restoreQuantity = Math.max(Number(item.quantity || 0) - alreadyReturnedQuantity, 0);

    if (restoreQuantity === 0) continue;

    if (item.stock_quantity === null || item.stock_quantity === undefined) {
      const error = new Error("Cannot restore stock for one or more deleted products");
      error.statusCode = 409;
      throw error;
    }

    const newStock = previousStock + restoreQuantity;

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
       VALUES (?, ?, ?, NULL, 'payment_failed_restore', ?, ?, ?, ?, 0, ?)`,
      [
        shopId,
        item.product_id,
        userId,
        restoreQuantity,
        previousStock,
        newStock,
        item.buying_price,
        `Payment failed stock restore for ${saleLabel}`,
      ]
    );

    restoredItems.push({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: restoreQuantity,
      previous_stock: previousStock,
      new_stock: newStock,
    });
  }

  return { restoredItems, restoredBatchItems };
};

exports.getPendingPayments = async (req, res) => {
  try {
    await ensureSalesPaymentColumns();
    await ensurePaymentVerificationTable();

    const [payments] = await db.promise().query(
      `SELECT
         sales.id AS sale_id,
         sales.invoice_no,
         sales.total_amount,
         COALESCE(payment_verifications.amount, sales.total_amount) AS amount,
         COALESCE(payment_verifications.payment_method, sales.payment_type) AS payment_type,
         payment_verifications.payment_method,
         sales.paid_amount,
         COALESCE(payment_verifications.status, sales.payment_status) AS payment_status,
         payment_verifications.status AS verification_status,
         COALESCE(payment_verifications.reference_no, sales.payment_reference) AS payment_reference,
         payment_verifications.reference_no,
         COALESCE(payment_verifications.approval_code, sales.approval_code) AS approval_code,
         COALESCE(payment_verifications.card_last_four, sales.card_last_four) AS card_last_four,
         sales.created_at,
         customers.customer_name
       FROM sales
       LEFT JOIN payment_verifications
         ON payment_verifications.sale_id = sales.id
         AND payment_verifications.shop_id = sales.shop_id
         AND payment_verifications.status = 'pending'
       LEFT JOIN customers
         ON customers.id = sales.customer_id
        AND customers.shop_id = sales.shop_id
       WHERE sales.shop_id = ?
         AND sales.payment_type IN ('card', 'bank_transfer', 'qr')
         AND (
           sales.payment_status = 'pending'
           OR payment_verifications.status = 'pending'
         )
       ORDER BY sales.created_at ASC, sales.id ASC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Pending payments fetched successfully",
      payments: payments.map(formatPayment),
    });
  } catch (error) {
    console.error("Get pending payments error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching pending payments" });
  }
};

exports.verifyPayment = async (req, res) => {
  const saleId = req.params.sale_id;
  const errors = validateVerificationFields(req.body);

  if (!isPositiveInteger(saleId)) {
    return res.status(400).json({ message: "Valid sale id is required" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  const connection = db.promise();

  try {
    await ensureSalesPaymentColumns();
    await ensurePaymentVerificationTable();
    await connection.beginTransaction();

    const [sales] = await connection.query(
      `SELECT id, payment_type, payment_status, total_amount, stock_restored_at,
              payment_reference, approval_code, card_last_four
       FROM sales
       WHERE id = ? AND shop_id = ?
       LIMIT 1
       FOR UPDATE`,
      [saleId, req.user.shop_id]
    );

    if (sales.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Payment not found" });
    }

    if (!verifiablePaymentTypes.includes(sales[0].payment_type)) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Only card, bank transfer, and QR payments can be verified" });
    }

    if (sales[0].payment_status === "failed" || sales[0].stock_restored_at) {
      await connection.rollback();
      return res.status(409).json({
        message: "Failed payments cannot be verified. Create a new sale.",
      });
    }

    const paymentReference = optionalText(req.body.payment_reference);
    const approvalCode = optionalText(req.body.approval_code);
    const cardLastFour = optionalText(req.body.card_last_four);

    await connection.query(
      `UPDATE sales
       SET payment_status = 'verified',
           payment_reference = COALESCE(?, payment_reference),
           approval_code = COALESCE(?, approval_code),
           card_last_four = COALESCE(?, card_last_four),
           verified_by = ?,
           verified_at = NOW()
       WHERE id = ? AND shop_id = ?`,
      [
        paymentReference,
        approvalCode,
        cardLastFour,
        req.user.id,
        saleId,
        req.user.shop_id,
      ]
    );

    const [verificationUpdate] = await connection.query(
      `UPDATE payment_verifications
       SET status = 'verified',
           reference_no = COALESCE(?, reference_no),
           approval_code = COALESCE(?, approval_code),
           card_last_four = COALESCE(?, card_last_four),
           amount = ?,
           payment_method = ?,
           verified_by = ?,
           verified_at = NOW(),
           failed_at = NULL
       WHERE sale_id = ? AND shop_id = ?`,
      [
        paymentReference,
        approvalCode,
        cardLastFour,
        sales[0].total_amount,
        sales[0].payment_type,
        req.user.id,
        saleId,
        req.user.shop_id,
      ]
    );

    if (verificationUpdate.affectedRows === 0) {
      await connection.query(
        `INSERT INTO payment_verifications
         (sale_id, shop_id, payment_method, amount, reference_no, approval_code,
          card_last_four, status, verified_by, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?, NOW())`,
        [
          saleId,
          req.user.shop_id,
          sales[0].payment_type,
          sales[0].total_amount,
          paymentReference || sales[0].payment_reference || null,
          approvalCode || sales[0].approval_code || null,
          cardLastFour || sales[0].card_last_four || null,
          req.user.id,
        ]
      );
    }

    const [updatedPayments] = await connection.query(
      `SELECT
         sales.id AS sale_id,
         sales.invoice_no,
         sales.total_amount,
         payment_verifications.amount,
         COALESCE(payment_verifications.payment_method, sales.payment_type) AS payment_type,
         payment_verifications.payment_method,
         sales.paid_amount,
         sales.payment_status,
         payment_verifications.status AS verification_status,
         COALESCE(payment_verifications.reference_no, sales.payment_reference) AS payment_reference,
         payment_verifications.reference_no,
         COALESCE(payment_verifications.approval_code, sales.approval_code) AS approval_code,
         COALESCE(payment_verifications.card_last_four, sales.card_last_four) AS card_last_four,
         sales.verified_by,
         sales.verified_at,
         sales.created_at,
         customers.customer_name
       FROM sales
       LEFT JOIN payment_verifications
         ON payment_verifications.sale_id = sales.id
         AND payment_verifications.shop_id = sales.shop_id
       LEFT JOIN customers
         ON customers.id = sales.customer_id
        AND customers.shop_id = sales.shop_id
       WHERE sales.id = ? AND sales.shop_id = ?
       LIMIT 1`,
      [saleId, req.user.shop_id]
    );

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "payment_verified",
      entity_type: "sale",
      entity_id: Number(saleId),
      description: `Verified ${sales[0].payment_type} payment for sale ${saleId}`,
    });

    return res.json({
      message: "Payment verified successfully",
      payment: formatPayment(updatedPayments[0]),
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Verify payment rollback failed:", rollbackError.message);
    }

    console.error("Verify payment error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while verifying payment" });
  }
};

exports.failPayment = async (req, res) => {
  const saleId = req.params.sale_id;

  if (!isPositiveInteger(saleId)) {
    return res.status(400).json({ message: "Valid sale id is required" });
  }

  const connection = db.promise();

  try {
    await ensureSalesPaymentColumns();
    await ensurePaymentVerificationTable();
    await ensureStockMovementsTable();
    await ensureSaleBatchSchema();
    await connection.beginTransaction();

    const [sales] = await connection.query(
      `SELECT id, invoice_no, payment_type, payment_status, total_amount,
              stock_restored_at, payment_reference, approval_code, card_last_four
       FROM sales
       WHERE id = ? AND shop_id = ?
       LIMIT 1
       FOR UPDATE`,
      [saleId, req.user.shop_id]
    );

    if (sales.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Payment not found" });
    }

    if (!verifiablePaymentTypes.includes(sales[0].payment_type)) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Only card, bank transfer, and QR payments can be failed" });
    }

    const restoreResult = await restoreStockForFailedSale(
      connection,
      sales[0],
      req.user.shop_id,
      req.user.id
    );

    await connection.query(
      `UPDATE sales
       SET payment_status = 'failed',
           verified_by = NULL,
           verified_at = NULL,
           stock_restored_at = COALESCE(stock_restored_at, NOW())
       WHERE id = ? AND shop_id = ?`,
      [saleId, req.user.shop_id]
    );

    const [verificationUpdate] = await connection.query(
      `UPDATE payment_verifications
       SET status = 'failed',
           amount = ?,
           payment_method = ?,
           reference_no = COALESCE(reference_no, ?),
           approval_code = COALESCE(approval_code, ?),
           card_last_four = COALESCE(card_last_four, ?),
           verified_by = NULL,
           verified_at = NULL,
           failed_at = COALESCE(failed_at, NOW())
       WHERE sale_id = ? AND shop_id = ?`,
      [
        sales[0].total_amount,
        sales[0].payment_type,
        sales[0].payment_reference || null,
        sales[0].approval_code || null,
        sales[0].card_last_four || null,
        saleId,
        req.user.shop_id,
      ]
    );

    if (verificationUpdate.affectedRows === 0) {
      await connection.query(
        `INSERT INTO payment_verifications
         (sale_id, shop_id, payment_method, amount, reference_no, approval_code,
          card_last_four, status, failed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'failed', NOW())`,
        [
          saleId,
          req.user.shop_id,
          sales[0].payment_type,
          sales[0].total_amount,
          sales[0].payment_reference || null,
          sales[0].approval_code || null,
          sales[0].card_last_four || null,
        ]
      );
    }

    await connection.commit();

    await createAuditLogFromRequest(req, {
      action: "payment_failed",
      entity_type: "sale",
      entity_id: Number(saleId),
      description: `Marked ${sales[0].payment_type} payment as failed for sale ${saleId}`,
    });

    return res.json({
      message: "Payment marked as failed",
      stock_restored:
        restoreResult.restoredItems.length > 0 ||
        restoreResult.restoredBatchItems.length > 0,
      restored_items: restoreResult.restoredItems,
      batch_restored_items: restoreResult.restoredBatchItems,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Fail payment rollback failed:", rollbackError.message);
    }

    console.error("Fail payment error:", error.message);

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return res
      .status(500)
      .json({ message: "Server error while failing payment" });
  }
};
