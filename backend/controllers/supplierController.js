const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");

const isMissing = (value) => value === undefined || value === null || value === "";

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const isNonNegativeNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) >= 0;

const formatMoney = (value) => Number(Number(value).toFixed(2));

const getStatus = (totalAmount, paidAmount, balanceAmount) => {
  if (balanceAmount === 0) return "paid";
  if (paidAmount > 0 && balanceAmount > 0 && paidAmount < totalAmount) {
    return "partial";
  }
  return "unpaid";
};

const formatTransaction = (transaction) => ({
  ...transaction,
  total_amount: Number(transaction.total_amount),
  paid_amount: Number(transaction.paid_amount),
  balance_amount: Number(transaction.balance_amount),
});

exports.addSupplier = async (req, res) => {
  const { supplier_name, phone, address } = req.body;

  if (isMissing(supplier_name)) {
    return res.status(400).json({ message: "supplier_name is required" });
  }

  try {
    const [result] = await db.promise().query(
      "INSERT INTO suppliers (shop_id, supplier_name, phone, address) VALUES (?, ?, ?, ?)",
      [req.user.shop_id, supplier_name, phone || null, address || null]
    );

    const [suppliers] = await db.promise().query(
      "SELECT * FROM suppliers WHERE id = ? AND shop_id = ? LIMIT 1",
      [result.insertId, req.user.shop_id]
    );

    await createAuditLogFromRequest(req, {
      action: "supplier_add",
      entity_type: "supplier",
      entity_id: result.insertId,
      description: `Added supplier ${supplier_name}`,
    });

    return res.status(201).json({
      message: "Supplier added successfully",
      supplier: suppliers[0],
    });
  } catch (error) {
    console.error("Add supplier error:", error.message);
    return res.status(500).json({ message: "Server error while adding supplier" });
  }
};

exports.getSuppliers = async (req, res) => {
  try {
    const [suppliers] = await db.promise().query(
      "SELECT * FROM suppliers WHERE shop_id = ? ORDER BY id DESC",
      [req.user.shop_id]
    );

    return res.json({
      message: "Suppliers fetched successfully",
      suppliers,
    });
  } catch (error) {
    console.error("Get suppliers error:", error.message);
    return res.status(500).json({ message: "Server error while fetching suppliers" });
  }
};

exports.updateSupplier = async (req, res) => {
  const { id } = req.params;
  const { supplier_name, phone, address } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid supplier id is required" });
  }

  if (isMissing(supplier_name)) {
    return res.status(400).json({ message: "supplier_name is required" });
  }

  try {
    const [result] = await db.promise().query(
      `UPDATE suppliers
       SET supplier_name = ?, phone = ?, address = ?
       WHERE id = ? AND shop_id = ?`,
      [supplier_name, phone || null, address || null, id, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    await createAuditLogFromRequest(req, {
      action: "supplier_update",
      entity_type: "supplier",
      entity_id: Number(id),
      description: `Updated supplier ${supplier_name}`,
    });

    return res.json({ message: "Supplier updated successfully" });
  } catch (error) {
    console.error("Update supplier error:", error.message);
    return res.status(500).json({ message: "Server error while updating supplier" });
  }
};

exports.deleteSupplier = async (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid supplier id is required" });
  }

  try {
    const [suppliers] = await db.promise().query(
      "SELECT supplier_name FROM suppliers WHERE id = ? AND shop_id = ? LIMIT 1",
      [id, req.user.shop_id]
    );

    const [result] = await db.promise().query(
      "DELETE FROM suppliers WHERE id = ? AND shop_id = ?",
      [id, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    await createAuditLogFromRequest(req, {
      action: "supplier_delete",
      entity_type: "supplier",
      entity_id: Number(id),
      description: `Deleted supplier ${suppliers[0]?.supplier_name || id}`,
    });

    return res.json({ message: "Supplier deleted successfully" });
  } catch (error) {
    console.error("Delete supplier error:", error.message);

    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Supplier has transactions and cannot be deleted",
      });
    }

    return res.status(500).json({ message: "Server error while deleting supplier" });
  }
};

exports.addSupplierTransaction = async (req, res) => {
  const { supplier_id, description, total_amount, paid_amount } = req.body;

  if (!isPositiveInteger(supplier_id)) {
    return res
      .status(400)
      .json({ message: "supplier_id must be a positive integer" });
  }

  if (!isNonNegativeNumber(total_amount) || Number(total_amount) <= 0) {
    return res.status(400).json({ message: "total_amount must be greater than 0" });
  }

  if (!isNonNegativeNumber(paid_amount || 0)) {
    return res.status(400).json({ message: "paid_amount must be a non-negative number" });
  }

  const totalAmount = formatMoney(Number(total_amount));
  const paidAmount = formatMoney(Number(paid_amount || 0));

  if (paidAmount > totalAmount) {
    return res.status(400).json({ message: "paid_amount cannot exceed total_amount" });
  }

  const balanceAmount = formatMoney(totalAmount - paidAmount);
  const status = getStatus(totalAmount, paidAmount, balanceAmount);

  try {
    const [suppliers] = await db.promise().query(
      "SELECT id FROM suppliers WHERE id = ? AND shop_id = ? LIMIT 1",
      [supplier_id, req.user.shop_id]
    );

    if (suppliers.length === 0) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const [result] = await db.promise().query(
      `INSERT INTO supplier_transactions
       (shop_id, supplier_id, description, total_amount, paid_amount, balance_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.shop_id,
        supplier_id,
        description || null,
        totalAmount,
        paidAmount,
        balanceAmount,
        status,
      ]
    );

    return res.status(201).json({
      message: "Supplier transaction added successfully",
      transaction_id: result.insertId,
    });
  } catch (error) {
    console.error("Add supplier transaction error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while adding supplier transaction" });
  }
};

exports.getSupplierTransactions = async (req, res) => {
  try {
    const [transactions] = await db.promise().query(
      `SELECT supplier_transactions.*, suppliers.supplier_name, suppliers.phone
       FROM supplier_transactions
       INNER JOIN suppliers
         ON suppliers.id = supplier_transactions.supplier_id
        AND suppliers.shop_id = supplier_transactions.shop_id
       WHERE supplier_transactions.shop_id = ?
       ORDER BY supplier_transactions.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Supplier transactions fetched successfully",
      transactions: transactions.map(formatTransaction),
    });
  } catch (error) {
    console.error("Get supplier transactions error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching supplier transactions" });
  }
};

exports.paySupplierTransaction = async (req, res) => {
  const { id } = req.params;
  const { paid_amount } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid transaction id is required" });
  }

  if (!isNonNegativeNumber(paid_amount) || Number(paid_amount) <= 0) {
    return res.status(400).json({ message: "paid_amount must be greater than 0" });
  }

  const paymentAmount = formatMoney(Number(paid_amount));
  const connection = db.promise();

  try {
    await connection.beginTransaction();

    const [transactions] = await connection.query(
      "SELECT * FROM supplier_transactions WHERE id = ? AND shop_id = ? LIMIT 1 FOR UPDATE",
      [id, req.user.shop_id]
    );

    if (transactions.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Supplier transaction not found" });
    }

    const transaction = transactions[0];
    const totalAmount = Number(transaction.total_amount);
    const currentPaid = Number(transaction.paid_amount);
    const currentBalance = Number(transaction.balance_amount);

    if (paymentAmount > currentBalance) {
      await connection.rollback();
      return res.status(400).json({
        message: "Payment amount cannot be greater than balance amount",
        balance_amount: currentBalance,
      });
    }

    const newPaidAmount = formatMoney(currentPaid + paymentAmount);
    const newBalanceAmount = formatMoney(currentBalance - paymentAmount);
    const status = getStatus(totalAmount, newPaidAmount, newBalanceAmount);

    await connection.query(
      `UPDATE supplier_transactions
       SET paid_amount = ?, balance_amount = ?, status = ?
       WHERE id = ? AND shop_id = ?`,
      [newPaidAmount, newBalanceAmount, status, id, req.user.shop_id]
    );

    await connection.commit();

    return res.json({ message: "Supplier payment recorded successfully" });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Supplier payment rollback failed:", rollbackError.message);
    }

    console.error("Pay supplier transaction error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while recording supplier payment" });
  }
};

exports.getSupplierSummary = async (req, res) => {
  try {
    const [[summary], [supplierCountRows]] = await Promise.all([
      db.promise().query(
        `SELECT
           COALESCE(SUM(total_amount), 0) AS total_supplier_purchase_amount,
           COALESCE(SUM(paid_amount), 0) AS total_supplier_paid_amount,
           COALESCE(SUM(balance_amount), 0) AS total_supplier_balance_amount,
           SUM(CASE WHEN status IN ('unpaid', 'partial') THEN 1 ELSE 0 END) AS unpaid_or_partial_count
         FROM supplier_transactions
         WHERE shop_id = ?`,
        [req.user.shop_id]
      ),
      db.promise().query(
        "SELECT COUNT(*) AS total_suppliers FROM suppliers WHERE shop_id = ?",
        [req.user.shop_id]
      ),
    ]);

    return res.json({
      message: "Supplier summary fetched successfully",
      summary: {
        total_supplier_purchase_amount: Number(
          summary[0].total_supplier_purchase_amount
        ),
        total_supplier_paid_amount: Number(summary[0].total_supplier_paid_amount),
        total_supplier_balance_amount: Number(
          summary[0].total_supplier_balance_amount
        ),
        total_suppliers: Number(supplierCountRows[0].total_suppliers || 0),
        unpaid_or_partial_count: Number(summary[0].unpaid_or_partial_count || 0),
      },
    });
  } catch (error) {
    console.error("Get supplier summary error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching supplier summary" });
  }
};
