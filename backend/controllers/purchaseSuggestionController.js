const db = require("../config/db");

const toNumber = (value) => Number(value || 0);
const formatMoney = (value) => Number(Number(value || 0).toFixed(2));

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const validateShopId = (req, res) => {
  if (!isPositiveInteger(req.user?.shop_id)) {
    res.status(400).json({ message: "Valid shop id is required" });
    return null;
  }

  return Number(req.user.shop_id);
};

const getSuggestedReorderQuantity = ({
  stockQuantity,
  lowStockLimit,
  salesLast30Days,
}) => {
  const baseQuantity = lowStockLimit * 2 - stockQuantity;

  if (salesLast30Days <= 0) {
    return Math.max(baseQuantity, 1);
  }

  const averageDailySales = salesLast30Days / 30;
  return Math.max(baseQuantity, Math.ceil(averageDailySales * 14), 1);
};

const mapSuggestion = (row) => {
  const stockQuantity = Number(row.stock_quantity || 0);
  const lowStockLimit = Number(row.low_stock_limit || 0);
  const buyingPrice = toNumber(row.buying_price);
  const salesLast30Days = Number(row.sales_last_30_days || 0);
  const averageDailySales = salesLast30Days / 30;
  const suggestedReorderQuantity = getSuggestedReorderQuantity({
    stockQuantity,
    lowStockLimit,
    salesLast30Days,
  });

  return {
    product_id: row.product_id,
    product_name: row.product_name,
    product_code: row.product_code,
    barcode: row.barcode,
    category: row.category,
    buying_price: buyingPrice,
    selling_price: toNumber(row.selling_price),
    stock_quantity: stockQuantity,
    low_stock_limit: lowStockLimit,
    suggested_reorder_quantity: suggestedReorderQuantity,
    estimated_purchase_cost: formatMoney(suggestedReorderQuantity * buyingPrice),
    sales_last_30_days: salesLast30Days,
    average_daily_sales: formatMoney(averageDailySales),
    preferred_supplier_id: row.preferred_supplier_id || null,
    preferred_supplier_name: row.preferred_supplier_name || null,
  };
};

const getLowStockSuggestionRows = async (shopId) => {
  const [rows] = await db.promise().query(
    `SELECT
       products.id AS product_id,
       products.product_name,
       products.product_code,
       products.barcode,
       products.category,
       products.buying_price,
       products.selling_price,
       products.stock_quantity,
       products.low_stock_limit,
       COALESCE(sales_stats.sales_last_30_days, 0) AS sales_last_30_days,
       preferred_suppliers.supplier_id AS preferred_supplier_id,
       suppliers.supplier_name AS preferred_supplier_name
     FROM products
     LEFT JOIN (
       SELECT
         sale_items.product_id,
         COALESCE(SUM(sale_items.quantity), 0) AS sales_last_30_days
       FROM sale_items
       INNER JOIN sales ON sales.id = sale_items.sale_id
       WHERE sales.shop_id = ?
         AND sales.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY sale_items.product_id
     ) AS sales_stats ON sales_stats.product_id = products.id
     LEFT JOIN (
       SELECT stock_movements.product_id, stock_movements.supplier_id
       FROM stock_movements
       INNER JOIN (
         SELECT product_id, MAX(id) AS latest_movement_id
         FROM stock_movements
         WHERE shop_id = ? AND supplier_id IS NOT NULL
         GROUP BY product_id
       ) AS latest_movements
         ON latest_movements.latest_movement_id = stock_movements.id
     ) AS preferred_suppliers ON preferred_suppliers.product_id = products.id
     LEFT JOIN suppliers
       ON suppliers.id = preferred_suppliers.supplier_id
      AND suppliers.shop_id = products.shop_id
     WHERE products.shop_id = ?
       AND products.stock_quantity <= products.low_stock_limit
     ORDER BY products.stock_quantity ASC, sales_last_30_days DESC, products.product_name ASC`,
    [shopId, shopId, shopId]
  );

  return rows;
};

exports.getPurchaseSuggestions = async (req, res) => {
  const shopId = validateShopId(req, res);
  if (!shopId) return;

  try {
    const rows = await getLowStockSuggestionRows(shopId);
    return res.json({
      message: "Purchase suggestions fetched successfully",
      suggestions: rows.map(mapSuggestion),
    });
  } catch (error) {
    console.error("Get purchase suggestions error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching purchase suggestions" });
  }
};

exports.getFastMovingProducts = async (req, res) => {
  const shopId = validateShopId(req, res);
  if (!shopId) return;

  try {
    const [rows] = await db.promise().query(
      `SELECT
         products.id AS product_id,
         products.product_name,
         products.category,
         products.stock_quantity,
         products.low_stock_limit,
         COALESCE(SUM(sale_items.quantity), 0) AS total_quantity_sold,
         COALESCE(SUM(sale_items.subtotal), 0) AS total_sales_amount
       FROM sale_items
       INNER JOIN sales ON sales.id = sale_items.sale_id
       INNER JOIN products
         ON products.id = sale_items.product_id
        AND products.shop_id = sales.shop_id
       WHERE sales.shop_id = ?
         AND sales.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY
         products.id,
         products.product_name,
         products.category,
         products.stock_quantity,
         products.low_stock_limit
       ORDER BY total_quantity_sold DESC, total_sales_amount DESC
       LIMIT 10`,
      [shopId]
    );

    return res.json({
      message: "Fast-moving products fetched successfully",
      products: rows.map((row) => {
        const totalQuantitySold = Number(row.total_quantity_sold || 0);
        const stockQuantity = Number(row.stock_quantity || 0);
        const lowStockLimit = Number(row.low_stock_limit || 0);

        return {
          product_id: row.product_id,
          product_name: row.product_name,
          category: row.category,
          stock_quantity: stockQuantity,
          low_stock_limit: lowStockLimit,
          total_quantity_sold: totalQuantitySold,
          total_sales_amount: formatMoney(row.total_sales_amount),
          average_daily_sales: formatMoney(totalQuantitySold / 30),
          stock_status:
            stockQuantity <= lowStockLimit ? "low_stock" : "normal",
        };
      }),
    });
  } catch (error) {
    console.error("Get fast-moving products error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching fast-moving products" });
  }
};

exports.getPurchaseSuggestionSummary = async (req, res) => {
  const shopId = validateShopId(req, res);
  if (!shopId) return;

  try {
    const [suggestionRows, [summaryRows]] = await Promise.all([
      getLowStockSuggestionRows(shopId),
      db.promise().query(
        `SELECT
           COALESCE(SUM(CASE WHEN stock_quantity <= low_stock_limit THEN 1 ELSE 0 END), 0) AS low_stock_count,
           COALESCE(SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count
         FROM products
         WHERE shop_id = ?`,
        [shopId]
      ),
    ]);

    const [fastMovingRows] = await db.promise().query(
      `SELECT COUNT(*) AS fast_moving_low_stock_count
       FROM (
         SELECT products.id
         FROM sale_items
         INNER JOIN sales ON sales.id = sale_items.sale_id
         INNER JOIN products
           ON products.id = sale_items.product_id
          AND products.shop_id = sales.shop_id
         WHERE sales.shop_id = ?
           AND sales.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           AND products.stock_quantity <= products.low_stock_limit
         GROUP BY products.id
       ) AS fast_moving_low_stock`,
      [shopId]
    );

    const suggestions = suggestionRows.map(mapSuggestion);
    const totalEstimatedPurchaseCost = suggestions.reduce(
      (sum, suggestion) => sum + suggestion.estimated_purchase_cost,
      0
    );
    const summary = summaryRows[0] || {};

    return res.json({
      message: "Purchase suggestion summary fetched successfully",
      summary: {
        low_stock_count: Number(summary.low_stock_count || 0),
        total_estimated_purchase_cost: formatMoney(totalEstimatedPurchaseCost),
        out_of_stock_count: Number(summary.out_of_stock_count || 0),
        fast_moving_low_stock_count: Number(
          fastMovingRows[0]?.fast_moving_low_stock_count || 0
        ),
      },
    });
  } catch (error) {
    console.error("Get purchase suggestion summary error:", error.message);
    return res.status(500).json({
      message: "Server error while fetching purchase suggestion summary",
    });
  }
};
