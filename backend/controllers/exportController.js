const db = require("../config/db");
const { ensureAuditLogsTable } = require("../utils/auditLog");
const { ensureProductCatalogSchema } = require("../utils/productCatalogSchema");
const { ensureSecurityTables } = require("../utils/security");
const {
  ensurePaymentVerificationTable,
  ensureSalesPaymentColumns,
} = require("../utils/paymentSchema");

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, "``")}\``;

const sqlLiteral = (value) => {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
};

const aliased = (expression, heading) => `${expression} AS ${quoteIdentifier(heading)}`;

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

const tableExists = async (tableName) => {
  const rows = await runQuery("SHOW TABLES LIKE ?", [tableName]);
  return rows.length > 0;
};

const getColumnSet = async (tableName) => {
  if (!(await tableExists(tableName))) return null;
  const columns = await runQuery(`SHOW COLUMNS FROM ${quoteIdentifier(tableName)}`);
  return new Set(columns.map((column) => column.Field));
};

const columnExpression = (columns, alias, column, fallback = null) => {
  const fallbackSql = sqlLiteral(fallback);
  if (!columns?.has(column)) return fallbackSql;
  return `COALESCE(${alias}.${quoteIdentifier(column)}, ${fallbackSql})`;
};

const plainColumnExpression = (columns, alias, column, fallback = null) => {
  if (!columns?.has(column)) return sqlLiteral(fallback);
  return `${alias}.${quoteIdentifier(column)}`;
};

const sendRows = (res, rows) => res.json(Array.isArray(rows) ? rows : []);

const handleExportError = (res, label, error) => {
  console.error(`${label} export error:`, error.message);
  return res.status(500).json({
    message: `Failed to export ${label}`,
    error: error.message,
  });
};

const runExport = (label, handler) => async (req, res) => {
  if (!ownerOnly(req, res)) return;

  try {
    const rows = await handler(req);
    return sendRows(res, rows);
  } catch (error) {
    return handleExportError(res, label, error);
  }
};

const addDateFilter = ({ sql, params, dateExpression, start_date, end_date }) => {
  if (start_date && end_date) {
    return {
      sql: `${sql} AND DATE(${dateExpression}) BETWEEN ? AND ?`,
      params: [...params, start_date, end_date],
    };
  }

  return { sql, params };
};

const getOptionalSheetRows = async ({
  tableName,
  shopId,
  columns,
  orderBy = "created_at",
}) => {
  const columnSet = await getColumnSet(tableName);
  if (!columnSet) return [];

  const selectColumns = columns.filter((column) => columnSet.has(column.name));
  if (selectColumns.length === 0) return [];

  const where = columnSet.has("shop_id") ? "WHERE shop_id = ?" : "";
  const params = columnSet.has("shop_id") ? [shopId] : [];
  const order = columnSet.has(orderBy) ? `ORDER BY ${quoteIdentifier(orderBy)} DESC` : "";

  return runQuery(
    `SELECT ${selectColumns
      .map((column) => aliased(quoteIdentifier(column.name), column.heading))
      .join(", ")}
     FROM ${quoteIdentifier(tableName)}
     ${where}
     ${order}`,
    params
  );
};

exports.getProductsExport = runExport("products", async (req) => {
  await ensureProductCatalogSchema();
  const shopId = req.user.shop_id;
  const productColumns = await getColumnSet("products");

  if (!productColumns) return [];

  const hasCategories = await tableExists("product_categories");
  const categoryJoin = hasCategories
    ? `LEFT JOIN product_categories pc
         ON ${productColumns.has("category_id") ? "pc.id = p.category_id AND pc.shop_id = p.shop_id" : "1 = 0"}`
    : "";
  const categoryExpression = hasCategories
    ? `COALESCE(pc.name, ${
        productColumns.has("category") ? "NULLIF(TRIM(p.category), '')" : "NULL"
      }, 'Uncategorized')`
    : columnExpression(productColumns, "p", "category", "Uncategorized");
  const retailPriceExpression = productColumns.has("retail_price")
    ? columnExpression(productColumns, "p", "retail_price", 0)
    : columnExpression(productColumns, "p", "selling_price", 0);

  return runQuery(
    `SELECT
       ${aliased(columnExpression(productColumns, "p", "product_name", ""), "Product Name")},
       ${aliased(columnExpression(productColumns, "p", "product_code", ""), "Product Code")},
       ${aliased(columnExpression(productColumns, "p", "barcode", ""), "Barcode")},
       ${aliased(plainColumnExpression(productColumns, "p", "category_id", null), "Category ID")},
       ${aliased(categoryExpression, "Category")},
       ${aliased(columnExpression(productColumns, "p", "unit", "pcs"), "Unit")},
       ${aliased(columnExpression(productColumns, "p", "buying_price", 0), "Buying Price")},
       ${aliased(
         productColumns.has("wholesale_price")
           ? `COALESCE(p.wholesale_price, ${columnExpression(productColumns, "p", "buying_price", 0)})`
           : columnExpression(productColumns, "p", "buying_price", 0),
         "Wholesale Price"
       )},
       ${aliased(retailPriceExpression, "Retail Price")},
       ${aliased(columnExpression(productColumns, "p", "selling_price", 0), "Selling Price")},
       ${aliased(columnExpression(productColumns, "p", "image_url", ""), "Image URL")},
       ${aliased(columnExpression(productColumns, "p", "stock_quantity", 0), "Stock Quantity")},
       ${aliased(columnExpression(productColumns, "p", "low_stock_limit", 0), "Low Stock Limit")},
       ${aliased(columnExpression(productColumns, "p", "created_at", null), "Created Date")}
     FROM products p
     ${categoryJoin}
     WHERE p.shop_id = ?
     ORDER BY ${productColumns.has("product_name") ? "p.product_name" : "p.id"} ASC`,
    [shopId]
  );
});

exports.getCategoriesExport = runExport("categories", async (req) => {
  await ensureProductCatalogSchema();
  const shopId = req.user.shop_id;
  const columns = await getColumnSet("product_categories");

  if (!columns) return [];

  return runQuery(
    `SELECT
       ${aliased(columnExpression(columns, "pc", "id", null), "Category ID")},
       ${aliased(columnExpression(columns, "pc", "name", "Uncategorized"), "Category")},
       ${aliased(columnExpression(columns, "pc", "description", ""), "Description")},
       ${aliased(columnExpression(columns, "pc", "is_active", 1), "Active")},
       ${aliased(columnExpression(columns, "pc", "created_at", null), "Created Date")}
     FROM product_categories pc
     WHERE pc.shop_id = ?
     ORDER BY pc.name ASC`,
    [shopId]
  );
});

exports.getSalesExport = runExport("sales", async (req) => {
  await ensureSalesPaymentColumns();
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateFilter(req);
  const salesColumns = await getColumnSet("sales");

  if (!salesColumns) return [];

  const hasCustomers = await tableExists("customers");
  const customerJoin =
    hasCustomers && salesColumns.has("customer_id")
      ? "LEFT JOIN customers c ON c.id = s.customer_id AND c.shop_id = s.shop_id"
      : "";
  const customerExpression =
    hasCustomers && salesColumns.has("customer_id")
      ? "COALESCE(c.customer_name, 'Walk-in customer')"
      : "'Walk-in customer'";

  let query = {
    sql: `SELECT
       ${aliased(columnExpression(salesColumns, "s", "invoice_no", ""), "Invoice No")},
       ${aliased(customerExpression, "Customer")},
       ${aliased(columnExpression(salesColumns, "s", "subtotal", 0), "Subtotal")},
       ${aliased(columnExpression(salesColumns, "s", "item_discount_total", 0), "Item Discounts")},
       ${aliased(columnExpression(salesColumns, "s", "bill_discount", 0), "Bill Discount")},
       ${aliased(columnExpression(salesColumns, "s", "discount_amount", 0), "Total Discount")},
       ${aliased(columnExpression(salesColumns, "s", "tax_percentage", 0), "Tax Percentage")},
       ${aliased(columnExpression(salesColumns, "s", "tax_amount", 0), "Tax Amount")},
       ${aliased(columnExpression(salesColumns, "s", "total_before_tax", 0), "Total Before Tax")},
       ${aliased(columnExpression(salesColumns, "s", "total_amount", 0), "Final Total")},
       ${aliased(columnExpression(salesColumns, "s", "total_profit", 0), "Total Profit")},
       ${aliased(columnExpression(salesColumns, "s", "payment_type", ""), "Payment Type")},
       ${aliased(columnExpression(salesColumns, "s", "paid_amount", 0), "Paid Amount")},
       ${aliased(columnExpression(salesColumns, "s", "balance_amount", 0), "Balance Amount")},
       ${aliased(columnExpression(salesColumns, "s", "payment_status", "verified"), "Payment Status")},
       ${aliased(columnExpression(salesColumns, "s", "payment_reference", ""), "Payment Reference")},
       ${aliased(columnExpression(salesColumns, "s", "created_at", null), "Created Date")}
     FROM sales s
     ${customerJoin}
     WHERE s.shop_id = ?`,
    params: [shopId],
  };

  query = addDateFilter({
    ...query,
    dateExpression: "s.created_at",
    start_date,
    end_date,
  });

  return runQuery(`${query.sql} ORDER BY s.created_at DESC`, query.params);
});

exports.getSaleItemsExport = runExport("sale items", async (req) => {
  await ensureSalesPaymentColumns();
  await ensureProductCatalogSchema();
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateFilter(req);
  const saleItemColumns = await getColumnSet("sale_items");
  const productColumns = await getColumnSet("products");
  const salesColumns = await getColumnSet("sales");

  if (!saleItemColumns || !salesColumns) return [];

  const hasProducts = Boolean(productColumns);
  const hasCategories = await tableExists("product_categories");
  const productJoin = hasProducts ? "LEFT JOIN products p ON si.product_id = p.id" : "";
  const categoryJoin =
    hasProducts && hasCategories && productColumns.has("category_id")
      ? "LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.shop_id = p.shop_id"
      : "";
  const categoryExpression =
    hasProducts && hasCategories
      ? `COALESCE(pc.name, ${
          productColumns.has("category") ? "NULLIF(TRIM(p.category), '')" : "NULL"
        }, 'Uncategorized')`
      : "'Uncategorized'";
  const productExpression =
    hasProducts && productColumns.has("product_name")
      ? "COALESCE(p.product_name, 'Deleted product')"
      : "'Deleted product'";

  let query = {
    sql: `SELECT
       ${aliased(columnExpression(salesColumns, "s", "invoice_no", ""), "Invoice No")},
       ${aliased(productExpression, "Product Name")},
       ${aliased(categoryExpression, "Category")},
       ${aliased(
         hasProducts ? columnExpression(productColumns, "p", "unit", "pcs") : "'pcs'",
         "Unit"
       )},
       ${aliased(columnExpression(saleItemColumns, "si", "quantity", 0), "Quantity")},
       ${aliased(columnExpression(saleItemColumns, "si", "buying_price", 0), "Buying Price")},
       ${aliased(columnExpression(saleItemColumns, "si", "unit_price", 0), "Unit Price")},
       ${aliased(columnExpression(saleItemColumns, "si", "selling_price", 0), "Selling Price")},
       ${aliased(columnExpression(saleItemColumns, "si", "item_discount", 0), "Item Discount")},
       ${aliased(columnExpression(saleItemColumns, "si", "item_discount_type", "fixed"), "Item Discount Type")},
       ${aliased(columnExpression(saleItemColumns, "si", "tax_percentage", 0), "Tax Percentage")},
       ${aliased(columnExpression(saleItemColumns, "si", "tax_amount", 0), "Tax Amount")},
       ${aliased(columnExpression(saleItemColumns, "si", "line_total_before_tax", 0), "Line Total Before Tax")},
       ${aliased(columnExpression(saleItemColumns, "si", "line_total", 0), "Line Total")},
       ${aliased(columnExpression(saleItemColumns, "si", "subtotal", 0), "Subtotal")},
       ${aliased(columnExpression(saleItemColumns, "si", "profit", 0), "Profit")},
       ${aliased(columnExpression(salesColumns, "s", "created_at", null), "Sale Date")}
     FROM sale_items si
     INNER JOIN sales s ON si.sale_id = s.id
     ${productJoin}
     ${categoryJoin}
     WHERE s.shop_id = ?`,
    params: [shopId],
  };

  query = addDateFilter({
    ...query,
    dateExpression: "s.created_at",
    start_date,
    end_date,
  });

  return runQuery(`${query.sql} ORDER BY s.created_at DESC`, query.params);
});

exports.getExpensesExport = runExport("expenses", async (req) => {
  const shopId = req.user.shop_id;
  const { start_date, end_date } = getDateFilter(req);
  const columns = await getColumnSet("expenses");

  if (!columns) return [];

  let query = {
    sql: `SELECT
       ${aliased(columnExpression(columns, "e", "expense_name", ""), "Expense Name")},
       ${aliased(columnExpression(columns, "e", "category", "Uncategorized"), "Category")},
       ${aliased(columnExpression(columns, "e", "amount", 0), "Amount")},
       ${aliased(columnExpression(columns, "e", "expense_date", null), "Expense Date")},
       ${aliased(columnExpression(columns, "e", "note", ""), "Note")},
       ${aliased(columnExpression(columns, "e", "created_at", null), "Created Date")}
     FROM expenses e
     WHERE e.shop_id = ?`,
    params: [shopId],
  };

  if (start_date && end_date) {
    query = {
      sql: `${query.sql} AND e.expense_date BETWEEN ? AND ?`,
      params: [...query.params, start_date, end_date],
    };
  }

  return runQuery(`${query.sql} ORDER BY e.expense_date DESC`, query.params);
});

exports.getCreditsExport = runExport("credits", async (req) => {
  const shopId = req.user.shop_id;
  const creditColumns = await getColumnSet("credit_records");
  const customerColumns = await getColumnSet("customers");

  if (!creditColumns) return [];

  const customerJoin =
    customerColumns && creditColumns.has("customer_id")
      ? "LEFT JOIN customers c ON cr.customer_id = c.id AND c.shop_id = cr.shop_id"
      : "";
  const customerExpression =
    customerColumns && customerColumns.has("customer_name")
      ? "COALESCE(c.customer_name, 'Unknown customer')"
      : "'Unknown customer'";
  const phoneExpression =
    customerColumns && customerColumns.has("phone") ? "COALESCE(c.phone, '')" : "''";

  return runQuery(
    `SELECT
       ${aliased(customerExpression, "Customer Name")},
       ${aliased(phoneExpression, "Phone")},
       ${aliased(columnExpression(creditColumns, "cr", "credit_amount", 0), "Credit Amount")},
       ${aliased(columnExpression(creditColumns, "cr", "paid_amount", 0), "Paid Amount")},
       ${aliased(columnExpression(creditColumns, "cr", "balance_amount", 0), "Balance Amount")},
       ${aliased(columnExpression(creditColumns, "cr", "status", ""), "Status")},
       ${aliased(columnExpression(creditColumns, "cr", "created_at", null), "Created Date")}
     FROM credit_records cr
     ${customerJoin}
     WHERE cr.shop_id = ?
     ORDER BY cr.created_at DESC`,
    [shopId]
  );
});

exports.getCustomersExport = runExport("customers", async (req) => {
  const shopId = req.user.shop_id;

  return getOptionalSheetRows({
    tableName: "customers",
    shopId,
    columns: [
      { name: "customer_name", heading: "Customer Name" },
      { name: "phone", heading: "Phone" },
      { name: "address", heading: "Address" },
      { name: "created_at", heading: "Created Date" },
    ],
  });
});

exports.getSuppliersExport = runExport("suppliers", async (req) => {
  const shopId = req.user.shop_id;

  return getOptionalSheetRows({
    tableName: "suppliers",
    shopId,
    columns: [
      { name: "supplier_name", heading: "Supplier Name" },
      { name: "phone", heading: "Phone" },
      { name: "address", heading: "Address" },
      { name: "created_at", heading: "Created Date" },
    ],
    orderBy: "supplier_name",
  });
});

exports.getSupplierTransactionsExport = runExport("supplier transactions", async (req) => {
  const shopId = req.user.shop_id;
  const transactionColumns = await getColumnSet("supplier_transactions");
  const supplierColumns = await getColumnSet("suppliers");

  if (!transactionColumns) return [];

  const supplierJoin =
    supplierColumns && transactionColumns.has("supplier_id")
      ? "LEFT JOIN suppliers s ON st.supplier_id = s.id AND s.shop_id = st.shop_id"
      : "";
  const supplierExpression =
    supplierColumns && supplierColumns.has("supplier_name")
      ? "COALESCE(s.supplier_name, 'No supplier')"
      : "'No supplier'";
  const phoneExpression =
    supplierColumns && supplierColumns.has("phone") ? "COALESCE(s.phone, '')" : "''";

  return runQuery(
    `SELECT
       ${aliased(supplierExpression, "Supplier Name")},
       ${aliased(phoneExpression, "Phone")},
       ${aliased(columnExpression(transactionColumns, "st", "description", ""), "Description")},
       ${aliased(columnExpression(transactionColumns, "st", "total_amount", 0), "Total Amount")},
       ${aliased(columnExpression(transactionColumns, "st", "paid_amount", 0), "Paid Amount")},
       ${aliased(columnExpression(transactionColumns, "st", "balance_amount", 0), "Balance Amount")},
       ${aliased(columnExpression(transactionColumns, "st", "status", ""), "Status")},
       ${aliased(columnExpression(transactionColumns, "st", "created_at", null), "Created Date")}
     FROM supplier_transactions st
     ${supplierJoin}
     WHERE st.shop_id = ?
     ORDER BY st.created_at DESC`,
    [shopId]
  );
});

exports.getStockMovementsExport = runExport("stock movements", async (req) => {
  const shopId = req.user.shop_id;
  const movementColumns = await getColumnSet("stock_movements");
  const productColumns = await getColumnSet("products");
  const supplierColumns = await getColumnSet("suppliers");

  if (!movementColumns) return [];

  const productJoin =
    productColumns && movementColumns.has("product_id")
      ? "LEFT JOIN products p ON sm.product_id = p.id AND p.shop_id = sm.shop_id"
      : "";
  const supplierJoin =
    supplierColumns && movementColumns.has("supplier_id")
      ? "LEFT JOIN suppliers s ON sm.supplier_id = s.id AND s.shop_id = sm.shop_id"
      : "";
  const userJoin = movementColumns.has("user_id")
    ? "LEFT JOIN users u ON sm.user_id = u.id"
    : "";
  const productExpression =
    productColumns && productColumns.has("product_name")
      ? "COALESCE(p.product_name, 'Deleted product')"
      : "'Deleted product'";
  const supplierExpression =
    supplierColumns && supplierColumns.has("supplier_name")
      ? "COALESCE(s.supplier_name, 'No supplier')"
      : "'No supplier'";
  const userExpression = movementColumns.has("user_id") ? "COALESCE(u.name, '')" : "''";

  return runQuery(
    `SELECT
       ${aliased(productExpression, "Product Name")},
       ${aliased(supplierExpression, "Supplier Name")},
       ${aliased(columnExpression(movementColumns, "sm", "movement_type", ""), "Movement Type")},
       ${aliased(columnExpression(movementColumns, "sm", "quantity", 0), "Quantity")},
       ${aliased(columnExpression(movementColumns, "sm", "previous_stock", 0), "Previous Stock")},
       ${aliased(columnExpression(movementColumns, "sm", "new_stock", 0), "New Stock")},
       ${aliased(columnExpression(movementColumns, "sm", "buying_price", 0), "Buying Price")},
       ${aliased(columnExpression(movementColumns, "sm", "total_cost", 0), "Total Cost")},
       ${aliased(userExpression, "Added By")},
       ${aliased(columnExpression(movementColumns, "sm", "note", ""), "Note")},
       ${aliased(columnExpression(movementColumns, "sm", "created_at", null), "Created Date")}
     FROM stock_movements sm
     ${productJoin}
     ${supplierJoin}
     ${userJoin}
     WHERE sm.shop_id = ?
     ORDER BY sm.created_at DESC`,
    [shopId]
  );
});

exports.getPaymentVerificationsExport = runExport("payment verifications", async (req) => {
  await ensurePaymentVerificationTable();
  await ensureSalesPaymentColumns();
  const shopId = req.user.shop_id;
  const paymentColumns = await getColumnSet("payment_verifications");

  if (!paymentColumns) return [];

  return runQuery(
    `SELECT
       ${aliased(columnExpression(paymentColumns, "pv", "sale_id", null), "Sale ID")},
       ${aliased("COALESCE(s.invoice_no, '')", "Invoice No")},
       ${aliased(columnExpression(paymentColumns, "pv", "payment_method", ""), "Payment Method")},
       ${aliased(columnExpression(paymentColumns, "pv", "amount", 0), "Amount")},
       ${aliased(columnExpression(paymentColumns, "pv", "reference_no", ""), "Reference")},
       ${aliased(columnExpression(paymentColumns, "pv", "status", ""), "Status")},
       ${aliased("COALESCE(u.name, '')", "Verified By")},
       ${aliased(columnExpression(paymentColumns, "pv", "verified_at", null), "Verified At")},
       ${aliased(columnExpression(paymentColumns, "pv", "failed_at", null), "Failed At")},
       ${aliased(columnExpression(paymentColumns, "pv", "created_at", null), "Created Date")}
     FROM payment_verifications pv
     LEFT JOIN sales s ON pv.sale_id = s.id AND pv.shop_id = s.shop_id
     LEFT JOIN users u ON pv.verified_by = u.id
     WHERE pv.shop_id = ?
     ORDER BY pv.created_at DESC`,
    [shopId]
  );
});

exports.getAuditLogsExport = runExport("audit logs", async (req) => {
  await ensureAuditLogsTable();
  const shopId = req.user.shop_id;

  return getOptionalSheetRows({
    tableName: "audit_logs",
    shopId,
    columns: [
      { name: "user_name", heading: "User Name" },
      { name: "user_role", heading: "Role" },
      { name: "action", heading: "Action" },
      { name: "entity_type", heading: "Entity Type" },
      { name: "entity_id", heading: "Entity ID" },
      { name: "description", heading: "Description" },
      { name: "ip_address", heading: "IP Address" },
      { name: "created_at", heading: "Created Date" },
    ],
  });
});

exports.getLoginActivityExport = runExport("login activity", async (req) => {
  await ensureSecurityTables();
  const shopId = req.user.shop_id;

  return getOptionalSheetRows({
    tableName: "login_activity",
    shopId,
    columns: [
      { name: "email", heading: "Email" },
      { name: "role", heading: "Role" },
      { name: "status", heading: "Status" },
      { name: "ip_address", heading: "IP Address" },
      { name: "user_agent", heading: "User Agent" },
      { name: "created_at", heading: "Created Date" },
    ],
  });
});
