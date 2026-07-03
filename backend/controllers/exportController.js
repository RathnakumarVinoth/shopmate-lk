const db = require("../config/db");
const { ensureProductCatalogSchema } = require("../utils/productCatalogSchema");

const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

const getDateFilter = (req) => {
  const { start_date, end_date } = req.query;
  return { start_date, end_date };
};

const ownerOnly = (req, res) => {
  if (req.user.role !== "owner") {
    res.status(403).json({ message: "Access denied. Owner only." });
    return false;
  }
  return true;
};

exports.getProductsExport = async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    await ensureProductCatalogSchema();
    const shopId = req.user.shop_id;

    const rows = await runQuery(
      `
      SELECT 
        product_name AS 'Product Name',
        product_code AS 'Product Code',
        barcode AS 'Barcode',
        category AS 'Category',
        unit AS 'Unit',
        buying_price AS 'Buying Price',
        COALESCE(wholesale_price, buying_price) AS 'Wholesale Price',
        selling_price AS 'Selling Price',
        image_url AS 'Image URL',
        stock_quantity AS 'Stock Quantity',
        low_stock_limit AS 'Low Stock Limit',
        created_at AS 'Created Date'
      FROM products
      WHERE shop_id = ?
      ORDER BY product_name ASC
      `,
      [shopId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to export products", error: error.message });
  }
};

exports.getSalesExport = async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    const shopId = req.user.shop_id;
    const { start_date, end_date } = getDateFilter(req);

    let sql = `
      SELECT 
        invoice_no AS 'Invoice No',
        total_amount AS 'Total Amount',
        total_profit AS 'Total Profit',
        discount_amount AS 'Discount',
        payment_type AS 'Payment Type',
        paid_amount AS 'Paid Amount',
        balance_amount AS 'Balance Amount',
        created_at AS 'Created Date'
      FROM sales
      WHERE shop_id = ?
    `;

    const params = [shopId];

    if (start_date && end_date) {
      sql += " AND DATE(created_at) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    sql += " ORDER BY created_at DESC";

    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to export sales", error: error.message });
  }
};

exports.getSaleItemsExport = async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    const shopId = req.user.shop_id;
    const { start_date, end_date } = getDateFilter(req);

    let sql = `
      SELECT 
        s.invoice_no AS 'Invoice No',
        p.product_name AS 'Product Name',
        si.quantity AS 'Quantity',
        si.buying_price AS 'Buying Price',
        si.selling_price AS 'Selling Price',
        si.subtotal AS 'Subtotal',
        si.profit AS 'Profit',
        s.created_at AS 'Sale Date'
      FROM sale_items si
      INNER JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.shop_id = ?
    `;

    const params = [shopId];

    if (start_date && end_date) {
      sql += " AND DATE(s.created_at) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    sql += " ORDER BY s.created_at DESC";

    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to export sale items", error: error.message });
  }
};

exports.getExpensesExport = async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    const shopId = req.user.shop_id;
    const { start_date, end_date } = getDateFilter(req);

    let sql = `
      SELECT 
        expense_name AS 'Expense Name',
        category AS 'Category',
        amount AS 'Amount',
        expense_date AS 'Expense Date',
        note AS 'Note',
        created_at AS 'Created Date'
      FROM expenses
      WHERE shop_id = ?
    `;

    const params = [shopId];

    if (start_date && end_date) {
      sql += " AND expense_date BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    sql += " ORDER BY expense_date DESC";

    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to export expenses", error: error.message });
  }
};

exports.getCreditsExport = async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    const shopId = req.user.shop_id;

    const rows = await runQuery(
      `
      SELECT 
        c.customer_name AS 'Customer Name',
        c.phone AS 'Phone',
        cr.credit_amount AS 'Credit Amount',
        cr.paid_amount AS 'Paid Amount',
        cr.balance_amount AS 'Balance Amount',
        cr.status AS 'Status',
        cr.created_at AS 'Created Date'
      FROM credit_records cr
      LEFT JOIN customers c ON cr.customer_id = c.id
      WHERE cr.shop_id = ?
      ORDER BY cr.created_at DESC
      `,
      [shopId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to export credits", error: error.message });
  }
};

exports.getSuppliersExport = async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    const shopId = req.user.shop_id;

    const rows = await runQuery(
      `
      SELECT 
        supplier_name AS 'Supplier Name',
        phone AS 'Phone',
        address AS 'Address',
        created_at AS 'Created Date'
      FROM suppliers
      WHERE shop_id = ?
      ORDER BY supplier_name ASC
      `,
      [shopId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to export suppliers", error: error.message });
  }
};

exports.getSupplierTransactionsExport = async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    const shopId = req.user.shop_id;

    const rows = await runQuery(
      `
      SELECT 
        s.supplier_name AS 'Supplier Name',
        s.phone AS 'Phone',
        st.description AS 'Description',
        st.total_amount AS 'Total Amount',
        st.paid_amount AS 'Paid Amount',
        st.balance_amount AS 'Balance Amount',
        st.status AS 'Status',
        st.created_at AS 'Created Date'
      FROM supplier_transactions st
      LEFT JOIN suppliers s ON st.supplier_id = s.id
      WHERE st.shop_id = ?
      ORDER BY st.created_at DESC
      `,
      [shopId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to export supplier transactions", error: error.message });
  }
};

exports.getStockMovementsExport = async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    const shopId = req.user.shop_id;

    const rows = await runQuery(
      `
      SELECT 
        p.product_name AS 'Product Name',
        s.supplier_name AS 'Supplier Name',
        sm.movement_type AS 'Movement Type',
        sm.quantity AS 'Quantity',
        sm.previous_stock AS 'Previous Stock',
        sm.new_stock AS 'New Stock',
        sm.buying_price AS 'Buying Price',
        sm.total_cost AS 'Total Cost',
        u.name AS 'Added By',
        sm.note AS 'Note',
        sm.created_at AS 'Created Date'
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN suppliers s ON sm.supplier_id = s.id
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.shop_id = ?
      ORDER BY sm.created_at DESC
      `,
      [shopId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to export stock movements", error: error.message });
  }
};
