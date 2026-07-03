const db = require("../config/db");
const { ensureReturnTables } = require("./returnController");
const { ensureSalesPaymentColumns } = require("../utils/paymentSchema");

const toNumber = (value) => Number(value || 0);

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getDateRange = (req) => {
  let { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    const now = new Date();
    start_date = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    end_date = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  }

  return { start_date, end_date };
};

exports.getSummary = async (req, res) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

  try {
    await ensureReturnTables();
    await ensureSalesPaymentColumns();

    const [
      [salesRows],
      [expenseRows],
      [creditRows],
      [supplierRows],
      [productRows],
      [returnRows],
      [paymentRows],
    ] = await Promise.all([
      db.promise().query(
        `SELECT
           COALESCE(SUM(total_amount), 0) AS total_sales,
           COALESCE(SUM(total_profit), 0) AS total_profit,
           COALESCE(SUM(discount_amount), 0) AS total_discounts,
           COALESCE(SUM(tax_amount), 0) AS total_tax,
           COUNT(*) AS total_bills,
           COALESCE(AVG(total_amount), 0) AS average_bill_value
         FROM sales
         WHERE shop_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
        [shopId, start_date, end_date]
      ),
      db.promise().query(
        `SELECT COALESCE(SUM(amount), 0) AS total_expenses
         FROM expenses
         WHERE shop_id = ? AND expense_date BETWEEN ? AND ?`,
        [shopId, start_date, end_date]
      ),
      db.promise().query(
        `SELECT COALESCE(SUM(balance_amount), 0) AS total_credit_balance
         FROM credit_records
         WHERE shop_id = ?`,
        [shopId]
      ),
      db.promise().query(
        `SELECT COALESCE(SUM(balance_amount), 0) AS total_supplier_balance
         FROM supplier_transactions
         WHERE shop_id = ?`,
        [shopId]
      ),
      db.promise().query(
        `SELECT
           COUNT(*) AS total_products,
           COALESCE(SUM(CASE WHEN stock_quantity <= low_stock_limit THEN 1 ELSE 0 END), 0) AS low_stock_count
         FROM products
         WHERE shop_id = ?`,
        [shopId]
      ),
      db.promise().query(
        `SELECT
           COUNT(*) AS total_returns,
           COALESCE(SUM(refund_amount), 0) AS total_refunds
         FROM sales_returns
         WHERE shop_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
        [shopId, start_date, end_date]
      ),
      db.promise().query(
        `SELECT
           COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN paid_amount ELSE 0 END), 0) AS pending_payment_total,
           COALESCE(SUM(CASE WHEN payment_status = 'verified' THEN paid_amount ELSE 0 END), 0) AS verified_payment_total
         FROM sales
         WHERE shop_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
        [shopId, start_date, end_date]
      ),
    ]);

    const sales = salesRows[0];
    const expenses = expenseRows[0];
    const credits = creditRows[0];
    const suppliers = supplierRows[0];
    const products = productRows[0];
    const returns = returnRows[0] || {};
    const payments = paymentRows[0] || {};
    const totalSales = toNumber(sales.total_sales);
    const totalRefunds = toNumber(returns.total_refunds);
    const totalProfit = toNumber(sales.total_profit);
    const totalExpenses = toNumber(expenses.total_expenses);

    return res.json({
      start_date,
      end_date,
      total_sales: totalSales,
      total_returns: Number(returns.total_returns || 0),
      total_refunds: totalRefunds,
      net_sales: totalSales - totalRefunds,
      total_profit: totalProfit,
      total_discounts: toNumber(sales.total_discounts),
      total_tax: toNumber(sales.total_tax),
      total_expenses: totalExpenses,
      net_profit: totalProfit - totalExpenses,
      total_bills: Number(sales.total_bills || 0),
      average_bill_value: toNumber(sales.average_bill_value),
      total_credit_balance: toNumber(credits.total_credit_balance),
      total_supplier_balance: toNumber(suppliers.total_supplier_balance),
      pending_payment_total: toNumber(payments.pending_payment_total),
      verified_payment_total: toNumber(payments.verified_payment_total),
      total_products: Number(products.total_products || 0),
      low_stock_count: Number(products.low_stock_count || 0),
    });
  } catch (error) {
    console.error("Report summary error:", error.message);
    return res.status(500).json({
      message: "Failed to load report summary",
      error: error.message,
    });
  }
};

exports.getDailySales = async (req, res) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

  try {
    const [rows] = await db.promise().query(
      `SELECT
         DATE(created_at) AS date,
         COALESCE(SUM(total_amount), 0) AS total_sales,
         COALESCE(SUM(total_profit), 0) AS total_profit,
         COUNT(*) AS total_bills
       FROM sales
       WHERE shop_id = ? AND DATE(created_at) BETWEEN ? AND ?
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`,
      [shopId, start_date, end_date]
    );

    return res.json(
      rows.map((row) => ({
        date: row.date,
        total_sales: toNumber(row.total_sales),
        total_profit: toNumber(row.total_profit),
        total_bills: Number(row.total_bills || 0),
      }))
    );
  } catch (error) {
    console.error("Daily sales report error:", error.message);
    return res.status(500).json({
      message: "Failed to load daily sales",
      error: error.message,
    });
  }
};

exports.getTopProducts = async (req, res) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

  try {
    const [rows] = await db.promise().query(
      `SELECT
         sale_items.product_id,
         COALESCE(products.product_name, 'Deleted product') AS product_name,
         COALESCE(SUM(sale_items.quantity), 0) AS total_quantity_sold,
         COALESCE(SUM(sale_items.subtotal), 0) AS total_sales_amount,
         COALESCE(SUM(sale_items.profit), 0) AS total_profit
       FROM sale_items
       INNER JOIN sales ON sale_items.sale_id = sales.id
       LEFT JOIN products ON sale_items.product_id = products.id
       WHERE sales.shop_id = ? AND DATE(sales.created_at) BETWEEN ? AND ?
       GROUP BY sale_items.product_id, products.product_name
       ORDER BY total_quantity_sold DESC, total_sales_amount DESC
       LIMIT 10`,
      [shopId, start_date, end_date]
    );

    return res.json(
      rows.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        total_quantity_sold: Number(row.total_quantity_sold || 0),
        total_sales_amount: toNumber(row.total_sales_amount),
        total_profit: toNumber(row.total_profit),
      }))
    );
  } catch (error) {
    console.error("Top products report error:", error.message);
    return res.status(500).json({
      message: "Failed to load top products",
      error: error.message,
    });
  }
};

exports.getPaymentMethods = async (req, res) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

  try {
    const [rows] = await db.promise().query(
      `SELECT
         payment_type,
         COALESCE(SUM(total_amount), 0) AS total_amount,
         COUNT(*) AS bill_count
       FROM sales
       WHERE shop_id = ? AND DATE(created_at) BETWEEN ? AND ?
       GROUP BY payment_type
       ORDER BY total_amount DESC`,
      [shopId, start_date, end_date]
    );

    return res.json(
      rows.map((row) => ({
        payment_type: row.payment_type,
        total_amount: toNumber(row.total_amount),
        bill_count: Number(row.bill_count || 0),
      }))
    );
  } catch (error) {
    console.error("Payment methods report error:", error.message);
    return res.status(500).json({
      message: "Failed to load payment methods",
      error: error.message,
    });
  }
};

exports.getExpensesByCategory = async (req, res) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

  try {
    const [rows] = await db.promise().query(
      `SELECT
         COALESCE(category, 'Uncategorized') AS category,
         COALESCE(SUM(amount), 0) AS total_amount
       FROM expenses
       WHERE shop_id = ? AND expense_date BETWEEN ? AND ?
       GROUP BY COALESCE(category, 'Uncategorized')
       ORDER BY total_amount DESC`,
      [shopId, start_date, end_date]
    );

    return res.json(
      rows.map((row) => ({
        category: row.category,
        total_amount: toNumber(row.total_amount),
      }))
    );
  } catch (error) {
    console.error("Expenses by category report error:", error.message);
    return res.status(500).json({
      message: "Failed to load expenses by category",
      error: error.message,
    });
  }
};
