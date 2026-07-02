const db = require("../config/db");
const { ensureSalesPaymentColumns } = require("../utils/paymentSchema");

const verifiablePaymentTypes = ["card", "bank_transfer", "qr"];

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const formatPayment = (payment) => ({
  ...payment,
  total_amount: Number(payment.total_amount || 0),
  paid_amount: Number(payment.paid_amount || 0),
  customer_name: payment.customer_name || null,
  payment_reference: payment.payment_reference || null,
  approval_code: payment.approval_code || null,
  card_last_four: payment.card_last_four || null,
});

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

    const [payments] = await db.promise().query(
      `SELECT
         sales.id AS sale_id,
         sales.invoice_no,
         sales.total_amount,
         sales.payment_type,
         sales.paid_amount,
         sales.payment_status,
         sales.payment_reference,
         sales.created_at,
         customers.customer_name
       FROM sales
       LEFT JOIN customers ON customers.id = sales.customer_id
       WHERE sales.shop_id = ?
         AND sales.payment_status = 'pending'
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

  try {
    await ensureSalesPaymentColumns();

    const [sales] = await db.promise().query(
      `SELECT id, payment_type
       FROM sales
       WHERE id = ? AND shop_id = ?
       LIMIT 1`,
      [saleId, req.user.shop_id]
    );

    if (sales.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (!verifiablePaymentTypes.includes(sales[0].payment_type)) {
      return res
        .status(400)
        .json({ message: "Only card, bank transfer, and QR payments can be verified" });
    }

    await db.promise().query(
      `UPDATE sales
       SET payment_status = 'verified',
           payment_reference = COALESCE(?, payment_reference),
           approval_code = COALESCE(?, approval_code),
           card_last_four = COALESCE(?, card_last_four),
           verified_by = ?,
           verified_at = NOW()
       WHERE id = ? AND shop_id = ?`,
      [
        optionalText(req.body.payment_reference),
        optionalText(req.body.approval_code),
        optionalText(req.body.card_last_four),
        req.user.id,
        saleId,
        req.user.shop_id,
      ]
    );

    const [updatedPayments] = await db.promise().query(
      `SELECT
         sales.id AS sale_id,
         sales.invoice_no,
         sales.total_amount,
         sales.payment_type,
         sales.paid_amount,
         sales.payment_status,
         sales.payment_reference,
         sales.approval_code,
         sales.card_last_four,
         sales.verified_by,
         sales.verified_at,
         sales.created_at,
         customers.customer_name
       FROM sales
       LEFT JOIN customers ON customers.id = sales.customer_id
       WHERE sales.id = ? AND sales.shop_id = ?
       LIMIT 1`,
      [saleId, req.user.shop_id]
    );

    return res.json({
      message: "Payment verified successfully",
      payment: formatPayment(updatedPayments[0]),
    });
  } catch (error) {
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

  try {
    await ensureSalesPaymentColumns();

    const [sales] = await db.promise().query(
      `SELECT id, payment_type
       FROM sales
       WHERE id = ? AND shop_id = ?
       LIMIT 1`,
      [saleId, req.user.shop_id]
    );

    if (sales.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (!verifiablePaymentTypes.includes(sales[0].payment_type)) {
      return res
        .status(400)
        .json({ message: "Only card, bank transfer, and QR payments can be failed" });
    }

    await db.promise().query(
      `UPDATE sales
       SET payment_status = 'failed'
       WHERE id = ? AND shop_id = ?`,
      [saleId, req.user.shop_id]
    );

    return res.json({ message: "Payment marked as failed" });
  } catch (error) {
    console.error("Fail payment error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while failing payment" });
  }
};
