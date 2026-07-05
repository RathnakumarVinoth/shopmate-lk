const db = require("../config/db");
const { ensureReturnTables } = require("./returnController");
const { ensureSalesPaymentColumns } = require("../utils/paymentSchema");

const toNumber = (value) => Number(value || 0);
const finalSaleStatusFilter = "payment_status IN ('verified', 'credit')";

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getDateRange = (req) => {
  let { start_date, end_date, from, to } = req.query;
  start_date = start_date || from;
  end_date = end_date || to;

  if (!start_date || !end_date) {
    const now = new Date();
    start_date = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    end_date = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  }

  return { start_date, end_date };
};

const getGroupBy = (req) => {
  const groupBy = req.query.group_by || req.query.groupBy || "daily";
  return ["daily", "weekly", "monthly"].includes(groupBy) ? groupBy : "daily";
};

const getGroupingSql = (column, groupBy) => {
  if (groupBy === "weekly") {
    return {
      label: `CONCAT(YEAR(${column}), '-W', LPAD(WEEK(${column}, 3), 2, '0'))`,
      sort: `YEARWEEK(${column}, 3)`,
    };
  }

  if (groupBy === "monthly") {
    return {
      label: `DATE_FORMAT(${column}, '%Y-%m')`,
      sort: `DATE_FORMAT(${column}, '%Y-%m')`,
    };
  }

  return {
    label: `DATE(${column})`,
    sort: `DATE(${column})`,
  };
};

const loadOverview = async (req) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

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
         COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total_amount ELSE 0 END), 0) AS cash_sales,
         COALESCE(SUM(CASE WHEN payment_type = 'card' THEN total_amount ELSE 0 END), 0) AS card_sales,
         COALESCE(SUM(CASE WHEN payment_type = 'qr' THEN total_amount ELSE 0 END), 0) AS qr_sales,
         COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_sales,
         COALESCE(SUM(CASE WHEN payment_type = 'bank_transfer' THEN total_amount ELSE 0 END), 0) AS bank_transfer_sales,
         COUNT(*) AS total_bills,
         COALESCE(AVG(total_amount), 0) AS average_bill_value
       FROM sales
       WHERE shop_id = ?
         AND DATE(created_at) BETWEEN ? AND ?
         AND ${finalSaleStatusFilter}`,
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
         COALESCE(SUM(sales_returns.refund_amount), 0) AS total_refunds
       FROM sales_returns
       INNER JOIN sales
         ON sales.id = sales_returns.sale_id
        AND sales.shop_id = sales_returns.shop_id
       WHERE sales_returns.shop_id = ?
         AND DATE(sales_returns.created_at) BETWEEN ? AND ?
         AND sales.${finalSaleStatusFilter}`,
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

  return {
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
    cash_sales: toNumber(sales.cash_sales),
    card_sales: toNumber(sales.card_sales),
    qr_sales: toNumber(sales.qr_sales),
    credit_sales: toNumber(sales.credit_sales),
    bank_transfer_sales: toNumber(sales.bank_transfer_sales),
    total_credit_balance: toNumber(credits.total_credit_balance),
    total_supplier_balance: toNumber(suppliers.total_supplier_balance),
    pending_payment_total: toNumber(payments.pending_payment_total),
    verified_payment_total: toNumber(payments.verified_payment_total),
    total_products: Number(products.total_products || 0),
    low_stock_count: Number(products.low_stock_count || 0),
  };
};

const sendReport = (label, loader) => async (req, res) => {
  try {
    const data = await loader(req);
    return res.json(data);
  } catch (error) {
    console.error(`${label} report error:`, error.message);
    return res.status(500).json({
      message: `Failed to load ${label}`,
      error: error.message,
    });
  }
};

exports.getSummary = sendReport("report summary", loadOverview);
exports.getOverview = sendReport("report overview", loadOverview);

const loadSalesChart = async (req) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);
  const groupBy = getGroupBy(req);
  const groupSql = getGroupingSql("created_at", groupBy);

  await ensureSalesPaymentColumns();

  const [rows] = await db.promise().query(
    `SELECT
       ${groupSql.label} AS period,
       ${groupSql.sort} AS sort_key,
       COALESCE(SUM(total_amount), 0) AS total_sales,
       COALESCE(SUM(total_profit), 0) AS total_profit,
       COALESCE(SUM(discount_amount), 0) AS total_discounts,
       COALESCE(SUM(tax_amount), 0) AS total_tax,
       COUNT(*) AS total_bills
     FROM sales
     WHERE shop_id = ?
       AND DATE(created_at) BETWEEN ? AND ?
       AND ${finalSaleStatusFilter}
     GROUP BY period, sort_key
     ORDER BY sort_key ASC`,
    [shopId, start_date, end_date]
  );

  return rows.map((row) => ({
    date: row.period,
    period: row.period,
    total_sales: toNumber(row.total_sales),
    total_profit: toNumber(row.total_profit),
    total_discounts: toNumber(row.total_discounts),
    total_tax: toNumber(row.total_tax),
    total_bills: Number(row.total_bills || 0),
  }));
};

const loadProfitChart = async (req) => {
  const salesRows = await loadSalesChart(req);

  return salesRows.map((row) => ({
    date: row.date,
    period: row.period,
    total_profit: row.total_profit,
    total_sales: row.total_sales,
    total_bills: row.total_bills,
  }));
};

const loadExpensesChart = async (req) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

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

  return rows.map((row) => ({
    category: row.category,
    total_amount: toNumber(row.total_amount),
  }));
};

exports.getDailySales = sendReport("daily sales", loadSalesChart);
exports.getSalesChart = sendReport("sales chart", loadSalesChart);
exports.getProfitChart = sendReport("profit chart", loadProfitChart);
exports.getExpensesChart = sendReport("expenses chart", loadExpensesChart);

exports.getTopProducts = async (req, res) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

  try {
    await ensureSalesPaymentColumns();

    const [rows] = await db.promise().query(
      `SELECT
         sale_items.product_id,
         COALESCE(products.product_name, 'Deleted product') AS product_name,
         COALESCE(SUM(sale_items.quantity), 0) AS total_quantity_sold,
         COALESCE(SUM(sale_items.subtotal), 0) AS total_sales_amount,
         COALESCE(SUM(sale_items.profit), 0) AS total_profit
       FROM sale_items
       INNER JOIN sales ON sale_items.sale_id = sales.id
       LEFT JOIN products
         ON sale_items.product_id = products.id
        AND products.shop_id = sales.shop_id
       WHERE sales.shop_id = ?
         AND DATE(sales.created_at) BETWEEN ? AND ?
         AND sales.${finalSaleStatusFilter}
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
    await ensureSalesPaymentColumns();

    const [rows] = await db.promise().query(
      `SELECT
         payment_type,
         COALESCE(SUM(total_amount), 0) AS total_amount,
         COUNT(*) AS bill_count
       FROM sales
       WHERE shop_id = ?
         AND DATE(created_at) BETWEEN ? AND ?
         AND ${finalSaleStatusFilter}
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

exports.getExpensesByCategory = sendReport("expenses by category", loadExpensesChart);

exports.getMonthlyComparison = async (req, res) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateRange(req);

  try {
    await ensureSalesPaymentColumns();

    const [rows] = await db.promise().query(
      `SELECT
         months.period,
         COALESCE(sales.total_sales, 0) AS total_sales,
         COALESCE(sales.total_profit, 0) AS total_profit,
         COALESCE(expenses.total_expenses, 0) AS total_expenses,
         COALESCE(sales.total_profit, 0) - COALESCE(expenses.total_expenses, 0) AS net_profit
       FROM (
         SELECT DATE_FORMAT(created_at, '%Y-%m') AS period
         FROM sales
         WHERE shop_id = ?
           AND DATE(created_at) BETWEEN ? AND ?
           AND ${finalSaleStatusFilter}
         UNION
         SELECT DATE_FORMAT(expense_date, '%Y-%m') AS period
         FROM expenses
         WHERE shop_id = ? AND expense_date BETWEEN ? AND ?
       ) AS months
       LEFT JOIN (
         SELECT DATE_FORMAT(created_at, '%Y-%m') AS period,
                COALESCE(SUM(total_amount), 0) AS total_sales,
                COALESCE(SUM(total_profit), 0) AS total_profit
         FROM sales
         WHERE shop_id = ?
           AND DATE(created_at) BETWEEN ? AND ?
           AND ${finalSaleStatusFilter}
         GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ) AS sales ON sales.period = months.period
       LEFT JOIN (
         SELECT DATE_FORMAT(expense_date, '%Y-%m') AS period,
                COALESCE(SUM(amount), 0) AS total_expenses
         FROM expenses
         WHERE shop_id = ? AND expense_date BETWEEN ? AND ?
         GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
       ) AS expenses ON expenses.period = months.period
       ORDER BY months.period ASC`,
      [
        shopId,
        start_date,
        end_date,
        shopId,
        start_date,
        end_date,
        shopId,
        start_date,
        end_date,
        shopId,
        start_date,
        end_date,
      ]
    );

    return res.json(
      rows.map((row) => ({
        period: row.period,
        total_sales: toNumber(row.total_sales),
        total_profit: toNumber(row.total_profit),
        total_expenses: toNumber(row.total_expenses),
        net_profit: toNumber(row.net_profit),
      }))
    );
  } catch (error) {
    console.error("Monthly comparison report error:", error.message);
    return res.status(500).json({
      message: "Failed to load monthly comparison",
      error: error.message,
    });
  }
};
