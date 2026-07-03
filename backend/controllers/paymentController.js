const db = require("../config/db");
const {
  ensurePaymentVerificationTable,
  ensureSalesPaymentColumns,
} = require("../utils/paymentSchema");

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
         sales.created_at,
         customers.customer_name
       FROM sales
       LEFT JOIN payment_verifications
         ON payment_verifications.sale_id = sales.id
         AND payment_verifications.shop_id = sales.shop_id
         AND payment_verifications.status = 'pending'
       LEFT JOIN customers ON customers.id = sales.customer_id
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
      `SELECT id, payment_type, total_amount, payment_reference
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
           amount = ?,
           payment_method = ?,
           verified_by = ?,
           verified_at = NOW(),
           failed_at = NULL
       WHERE sale_id = ? AND shop_id = ?`,
      [
        paymentReference,
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
         (sale_id, shop_id, payment_method, amount, reference_no, status, verified_by, verified_at)
         VALUES (?, ?, ?, ?, ?, 'verified', ?, NOW())`,
        [
          saleId,
          req.user.shop_id,
          sales[0].payment_type,
          sales[0].total_amount,
          paymentReference || sales[0].payment_reference || null,
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
         sales.approval_code,
         sales.card_last_four,
         sales.verified_by,
         sales.verified_at,
         sales.created_at,
         customers.customer_name
       FROM sales
       LEFT JOIN payment_verifications
         ON payment_verifications.sale_id = sales.id
         AND payment_verifications.shop_id = sales.shop_id
       LEFT JOIN customers ON customers.id = sales.customer_id
       WHERE sales.id = ? AND sales.shop_id = ?
       LIMIT 1`,
      [saleId, req.user.shop_id]
    );

    await connection.commit();

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
    await connection.beginTransaction();

    const [sales] = await connection.query(
      `SELECT id, payment_type, total_amount, payment_reference
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

    await connection.query(
      `UPDATE sales
       SET payment_status = 'failed',
           verified_by = NULL,
           verified_at = NULL
       WHERE id = ? AND shop_id = ?`,
      [saleId, req.user.shop_id]
    );

    const [verificationUpdate] = await connection.query(
      `UPDATE payment_verifications
       SET status = 'failed',
           amount = ?,
           payment_method = ?,
           reference_no = COALESCE(reference_no, ?),
           verified_by = NULL,
           verified_at = NULL,
           failed_at = NOW()
       WHERE sale_id = ? AND shop_id = ?`,
      [
        sales[0].total_amount,
        sales[0].payment_type,
        sales[0].payment_reference || null,
        saleId,
        req.user.shop_id,
      ]
    );

    if (verificationUpdate.affectedRows === 0) {
      await connection.query(
        `INSERT INTO payment_verifications
         (sale_id, shop_id, payment_method, amount, reference_no, status, failed_at)
         VALUES (?, ?, ?, ?, ?, 'failed', NOW())`,
        [
          saleId,
          req.user.shop_id,
          sales[0].payment_type,
          sales[0].total_amount,
          sales[0].payment_reference || null,
        ]
      );
    }

    await connection.commit();

    return res.json({ message: "Payment marked as failed" });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Fail payment rollback failed:", rollbackError.message);
    }

    console.error("Fail payment error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while failing payment" });
  }
};
