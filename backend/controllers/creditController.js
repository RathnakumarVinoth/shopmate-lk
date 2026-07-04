const db = require("../config/db");

const isMissing = (value) => value === undefined || value === null || value === "";

const isPositiveNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) > 0;

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const formatMoney = (value) => Number(Number(value).toFixed(2));

const formatCredit = (credit) => ({
  ...credit,
  credit_amount: Number(credit.credit_amount),
  paid_amount: Number(credit.paid_amount),
  balance_amount: Number(credit.balance_amount),
});

exports.addCustomer = async (req, res) => {
  const { customer_name, phone, address } = req.body;

  if (isMissing(customer_name)) {
    return res.status(400).json({ message: "customer_name is required" });
  }

  try {
    const [result] = await db.promise().query(
      "INSERT INTO customers (shop_id, customer_name, phone, address) VALUES (?, ?, ?, ?)",
      [req.user.shop_id, customer_name, phone || null, address || null]
    );

    const [customers] = await db.promise().query(
      "SELECT * FROM customers WHERE id = ? AND shop_id = ? LIMIT 1",
      [result.insertId, req.user.shop_id]
    );

    return res.status(201).json({
      message: "Customer added successfully",
      customer: customers[0],
    });
  } catch (error) {
    console.error("Add customer error:", error.message);
    return res.status(500).json({ message: "Server error while adding customer" });
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const [customers] = await db.promise().query(
      "SELECT * FROM customers WHERE shop_id = ? ORDER BY id DESC",
      [req.user.shop_id]
    );

    return res.json({
      message: "Customers fetched successfully",
      customers,
    });
  } catch (error) {
    console.error("Get customers error:", error.message);
    return res.status(500).json({ message: "Server error while fetching customers" });
  }
};

exports.addCredit = async (req, res) => {
  const { customer_id, credit_amount } = req.body;

  if (!isPositiveInteger(customer_id)) {
    return res
      .status(400)
      .json({ message: "customer_id must be a positive integer" });
  }

  if (!isPositiveNumber(credit_amount)) {
    return res
      .status(400)
      .json({ message: "credit_amount must be a positive number" });
  }

  const creditAmount = formatMoney(Number(credit_amount));

  try {
    const [customers] = await db.promise().query(
      "SELECT id FROM customers WHERE id = ? AND shop_id = ? LIMIT 1",
      [customer_id, req.user.shop_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const [result] = await db.promise().query(
      `INSERT INTO credit_records
       (shop_id, customer_id, sale_id, credit_amount, paid_amount, balance_amount, status)
       VALUES (?, ?, NULL, ?, 0, ?, 'unpaid')`,
      [req.user.shop_id, customer_id, creditAmount, creditAmount]
    );

    const [credits] = await db.promise().query(
      `SELECT credit_records.*, customers.customer_name, customers.phone
       FROM credit_records
       INNER JOIN customers
         ON customers.id = credit_records.customer_id
        AND customers.shop_id = credit_records.shop_id
       WHERE credit_records.id = ? AND credit_records.shop_id = ?
       LIMIT 1`,
      [result.insertId, req.user.shop_id]
    );

    return res.status(201).json({
      message: "Credit record added successfully",
      credit: formatCredit(credits[0]),
    });
  } catch (error) {
    console.error("Add credit error:", error.message);
    return res.status(500).json({ message: "Server error while adding credit" });
  }
};

exports.getCredits = async (req, res) => {
  try {
    const [credits] = await db.promise().query(
      `SELECT credit_records.*, customers.customer_name, customers.phone
       FROM credit_records
       INNER JOIN customers
         ON customers.id = credit_records.customer_id
        AND customers.shop_id = credit_records.shop_id
       WHERE credit_records.shop_id = ?
       ORDER BY credit_records.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Credit records fetched successfully",
      credits: credits.map(formatCredit),
    });
  } catch (error) {
    console.error("Get credits error:", error.message);
    return res.status(500).json({ message: "Server error while fetching credits" });
  }
};

exports.payCredit = async (req, res) => {
  const { id } = req.params;
  const { paid_amount } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid credit id is required" });
  }

  if (!isPositiveNumber(paid_amount)) {
    return res.status(400).json({ message: "paid_amount must be a positive number" });
  }

  const paymentAmount = formatMoney(Number(paid_amount));
  const connection = db.promise();

  try {
    await connection.beginTransaction();

    const [credits] = await connection.query(
      "SELECT * FROM credit_records WHERE id = ? AND shop_id = ? LIMIT 1 FOR UPDATE",
      [id, req.user.shop_id]
    );

    if (credits.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Credit record not found" });
    }

    const credit = credits[0];
    const currentPaid = Number(credit.paid_amount);
    const currentBalance = Number(credit.balance_amount);
    const creditAmount = Number(credit.credit_amount);

    if (paymentAmount > currentBalance) {
      await connection.rollback();
      return res.status(400).json({
        message: "Payment amount cannot be greater than balance amount",
        balance_amount: currentBalance,
      });
    }

    const newPaidAmount = formatMoney(currentPaid + paymentAmount);
    const newBalanceAmount = formatMoney(currentBalance - paymentAmount);
    let status = "unpaid";

    if (newBalanceAmount === 0) {
      status = "paid";
    } else if (newBalanceAmount < creditAmount) {
      status = "partial";
    }

    await connection.query(
      `UPDATE credit_records
       SET paid_amount = ?, balance_amount = ?, status = ?
       WHERE id = ? AND shop_id = ?`,
      [newPaidAmount, newBalanceAmount, status, id, req.user.shop_id]
    );

    await connection.commit();

    const [updatedCredits] = await db.promise().query(
      `SELECT credit_records.*, customers.customer_name, customers.phone
       FROM credit_records
       INNER JOIN customers
         ON customers.id = credit_records.customer_id
        AND customers.shop_id = credit_records.shop_id
       WHERE credit_records.id = ? AND credit_records.shop_id = ?
       LIMIT 1`,
      [id, req.user.shop_id]
    );

    return res.json({
      message: "Credit payment recorded successfully",
      credit: formatCredit(updatedCredits[0]),
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Credit payment rollback failed:", rollbackError.message);
    }

    console.error("Pay credit error:", error.message);
    return res.status(500).json({ message: "Server error while recording payment" });
  }
};

exports.getCreditSummary = async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
         COALESCE(SUM(credit_amount), 0) AS total_credit_amount,
         COALESCE(SUM(paid_amount), 0) AS total_paid_amount,
         COALESCE(SUM(balance_amount), 0) AS total_balance_amount,
         SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid_count,
         SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial_count
       FROM credit_records
       WHERE shop_id = ?`,
      [req.user.shop_id]
    );

    const summary = rows[0];
    const unpaidCount = Number(summary.unpaid_count || 0);
    const partialCount = Number(summary.partial_count || 0);

    return res.json({
      message: "Credit summary fetched successfully",
      summary: {
        total_credit_amount: Number(summary.total_credit_amount),
        total_paid_amount: Number(summary.total_paid_amount),
        total_balance_amount: Number(summary.total_balance_amount),
        unpaid_count: unpaidCount,
        partial_count: partialCount,
        unpaid_or_partial_count: unpaidCount + partialCount,
      },
    });
  } catch (error) {
    console.error("Get credit summary error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching credit summary" });
  }
};

exports.getCustomerHistory = async (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid customer id is required" });
  }

  try {
    const [customers] = await db.promise().query(
      `SELECT id, customer_name, phone, address, created_at
       FROM customers
       WHERE id = ? AND shop_id = ?
       LIMIT 1`,
      [id, req.user.shop_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const [[sales], [credits], [summaryRows]] = await Promise.all([
      db.promise().query(
        `SELECT id, invoice_no, total_amount, total_profit, discount_amount,
                payment_type, paid_amount, balance_amount, created_at
         FROM sales
         WHERE shop_id = ? AND customer_id = ?
         ORDER BY id DESC`,
        [req.user.shop_id, id]
      ),
      db.promise().query(
        `SELECT id, sale_id, credit_amount, paid_amount, balance_amount, status, created_at
         FROM credit_records
         WHERE shop_id = ? AND customer_id = ?
         ORDER BY id DESC`,
        [req.user.shop_id, id]
      ),
      db.promise().query(
        `SELECT
           COALESCE((SELECT SUM(total_amount) FROM sales WHERE shop_id = ? AND customer_id = ?), 0) AS total_purchases,
           COALESCE((SELECT SUM(credit_amount) FROM credit_records WHERE shop_id = ? AND customer_id = ?), 0) AS total_credit,
           COALESCE((SELECT SUM(paid_amount) FROM credit_records WHERE shop_id = ? AND customer_id = ?), 0) AS total_paid,
           COALESCE((SELECT SUM(balance_amount) FROM credit_records WHERE shop_id = ? AND customer_id = ?), 0) AS total_balance`,
        [
          req.user.shop_id,
          id,
          req.user.shop_id,
          id,
          req.user.shop_id,
          id,
          req.user.shop_id,
          id,
        ]
      ),
    ]);

    const summary = summaryRows[0] || {};

    return res.json({
      message: "Customer history fetched successfully",
      customer: customers[0],
      sales: sales.map((sale) => ({
        ...sale,
        total_amount: Number(sale.total_amount || 0),
        total_profit: Number(sale.total_profit || 0),
        discount_amount: Number(sale.discount_amount || 0),
        paid_amount: Number(sale.paid_amount || 0),
        balance_amount: Number(sale.balance_amount || 0),
      })),
      credits: credits.map(formatCredit),
      summary: {
        total_purchases: Number(summary.total_purchases || 0),
        total_credit: Number(summary.total_credit || 0),
        total_paid: Number(summary.total_paid || 0),
        total_balance: Number(summary.total_balance || 0),
      },
    });
  } catch (error) {
    console.error("Get customer history error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching customer history" });
  }
};
