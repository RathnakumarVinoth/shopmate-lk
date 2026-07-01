const db = require("../config/db");

const toNumber = (value) => Number(value || 0);

exports.getDashboard = async (req, res) => {
  const shopId = req.user.shop_id;

  try {
    const [
      [todaySalesRows],
      [productRows],
      [creditRows],
      [customerRows],
      [expenseRows],
      [supplierRows],
      [recentSales],
    ] = await Promise.all([
      db.promise().query(
        `SELECT
           COALESCE(SUM(total_amount), 0) AS today_sales_total,
           COALESCE(SUM(total_profit), 0) AS today_profit_total,
           COUNT(*) AS today_bill_count
         FROM sales
         WHERE shop_id = ? AND DATE(created_at) = CURDATE()`,
        [shopId]
      ),
      db.promise().query(
        `SELECT
           COUNT(*) AS total_products,
           SUM(CASE WHEN stock_quantity <= low_stock_limit THEN 1 ELSE 0 END) AS low_stock_count
         FROM products
         WHERE shop_id = ?`,
        [shopId]
      ),
      db.promise().query(
        `SELECT COALESCE(SUM(balance_amount), 0) AS total_credit_balance
         FROM credit_records
         WHERE shop_id = ?`,
        [shopId]
      ),
      db.promise().query(
        "SELECT COUNT(*) AS total_customers FROM customers WHERE shop_id = ?",
        [shopId]
      ),
      db.promise().query(
        `SELECT
           COALESCE(SUM(CASE WHEN expense_date = CURDATE() THEN amount ELSE 0 END), 0) AS today_expenses,
           COALESCE(SUM(CASE
             WHEN YEAR(expense_date) = YEAR(CURDATE())
              AND MONTH(expense_date) = MONTH(CURDATE())
             THEN amount ELSE 0 END), 0) AS month_expenses
         FROM expenses
         WHERE shop_id = ?`,
        [shopId]
      ),
      db.promise().query(
        `SELECT COALESCE(SUM(balance_amount), 0) AS supplier_balance
         FROM supplier_transactions
         WHERE shop_id = ?`,
        [shopId]
      ),
      db.promise().query(
        `SELECT id, invoice_no, total_amount, total_profit, payment_type, created_at
         FROM sales
         WHERE shop_id = ?
         ORDER BY id DESC
         LIMIT 5`,
        [shopId]
      ),
    ]);

    const todaySales = todaySalesRows[0];
    const products = productRows[0];
    const credits = creditRows[0];
    const customers = customerRows[0];
    const expenses = expenseRows[0];
    const suppliers = supplierRows[0];
    const todayProfitTotal = toNumber(todaySales.today_profit_total);
    const todayExpenses = toNumber(expenses.today_expenses);

    return res.json({
      message: "Dashboard fetched successfully",
      dashboard: {
        today_sales_total: toNumber(todaySales.today_sales_total),
        today_profit_total: todayProfitTotal,
        today_bill_count: Number(todaySales.today_bill_count || 0),
        total_products: Number(products.total_products || 0),
        low_stock_count: Number(products.low_stock_count || 0),
        total_credit_balance: toNumber(credits.total_credit_balance),
        total_customers: Number(customers.total_customers || 0),
        today_expenses: todayExpenses,
        month_expenses: toNumber(expenses.month_expenses),
        supplier_balance: toNumber(suppliers.supplier_balance),
        net_profit_today: todayProfitTotal - todayExpenses,
        recent_sales: recentSales.map((sale) => ({
          ...sale,
          total_amount: Number(sale.total_amount),
          total_profit: Number(sale.total_profit),
        })),
      },
    });
  } catch (error) {
    console.error("Get dashboard error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching dashboard" });
  }
};
