const db = require("../config/db");

const isMissing = (value) => value === undefined || value === null || value === "";

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const isPositiveNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) > 0;

const formatExpense = (expense) => ({
  ...expense,
  amount: Number(expense.amount),
});

const validateExpense = (body) => {
  const errors = [];

  if (isMissing(body.expense_name)) {
    errors.push("expense_name is required");
  }

  if (!isPositiveNumber(body.amount)) {
    errors.push("amount must be greater than 0");
  }

  return errors;
};

exports.addExpense = async (req, res) => {
  const { expense_name, category, amount, expense_date, note } = req.body;
  const errors = validateExpense(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    const [result] = await db.promise().query(
      `INSERT INTO expenses
       (shop_id, expense_name, category, amount, expense_date, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.shop_id,
        expense_name,
        category || null,
        Number(amount),
        expense_date || new Date().toISOString().slice(0, 10),
        note || null,
      ]
    );

    return res.status(201).json({
      message: "Expense added successfully",
      expense_id: result.insertId,
    });
  } catch (error) {
    console.error("Add expense error:", error.message);
    return res.status(500).json({ message: "Server error while adding expense" });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const [expenses] = await db.promise().query(
      "SELECT * FROM expenses WHERE shop_id = ? ORDER BY expense_date DESC, id DESC",
      [req.user.shop_id]
    );

    return res.json({
      message: "Expenses fetched successfully",
      expenses: expenses.map(formatExpense),
    });
  } catch (error) {
    console.error("Get expenses error:", error.message);
    return res.status(500).json({ message: "Server error while fetching expenses" });
  }
};

exports.updateExpense = async (req, res) => {
  const { id } = req.params;
  const { expense_name, category, amount, expense_date, note } = req.body;
  const errors = validateExpense(req.body);

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid expense id is required" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    const [result] = await db.promise().query(
      `UPDATE expenses
       SET expense_name = ?, category = ?, amount = ?, expense_date = ?, note = ?
       WHERE id = ? AND shop_id = ?`,
      [
        expense_name,
        category || null,
        Number(amount),
        expense_date || new Date().toISOString().slice(0, 10),
        note || null,
        id,
        req.user.shop_id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Expense not found" });
    }

    return res.json({ message: "Expense updated successfully" });
  } catch (error) {
    console.error("Update expense error:", error.message);
    return res.status(500).json({ message: "Server error while updating expense" });
  }
};

exports.deleteExpense = async (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid expense id is required" });
  }

  try {
    const [result] = await db.promise().query(
      "DELETE FROM expenses WHERE id = ? AND shop_id = ?",
      [id, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Expense not found" });
    }

    return res.json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Delete expense error:", error.message);
    return res.status(500).json({ message: "Server error while deleting expense" });
  }
};

exports.getExpenseSummary = async (req, res) => {
  try {
    const [[summaryRows], [categoryRows]] = await Promise.all([
      db.promise().query(
        `SELECT
           COALESCE(SUM(CASE WHEN expense_date = CURDATE() THEN amount ELSE 0 END), 0) AS today_expenses,
           COALESCE(SUM(CASE
             WHEN YEAR(expense_date) = YEAR(CURDATE())
              AND MONTH(expense_date) = MONTH(CURDATE())
             THEN amount ELSE 0 END), 0) AS month_expenses,
           COALESCE(SUM(amount), 0) AS total_expenses
         FROM expenses
         WHERE shop_id = ?`,
        [req.user.shop_id]
      ),
      db.promise().query(
        `SELECT COALESCE(category, 'Uncategorized') AS category,
                COALESCE(SUM(amount), 0) AS total_amount
         FROM expenses
         WHERE shop_id = ?
         GROUP BY COALESCE(category, 'Uncategorized')
         ORDER BY total_amount DESC`,
        [req.user.shop_id]
      ),
    ]);

    return res.json({
      message: "Expense summary fetched successfully",
      summary: {
        today_expenses: Number(summaryRows[0].today_expenses),
        month_expenses: Number(summaryRows[0].month_expenses),
        total_expenses: Number(summaryRows[0].total_expenses),
        expenses_by_category: categoryRows.map((row) => ({
          category: row.category,
          total_amount: Number(row.total_amount),
        })),
      },
    });
  } catch (error) {
    console.error("Get expense summary error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching expense summary" });
  }
};
