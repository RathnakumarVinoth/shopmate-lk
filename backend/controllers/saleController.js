const db = require("../config/db");

const allowedPaymentTypes = ["cash", "card", "bank_transfer", "qr", "credit"];

const toNumber = (value) => Number(value);

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const formatMoney = (value) => Number(Number(value).toFixed(2));

const validateSaleRequest = (body) => {
  const errors = [];

  if (
    body.payment_type !== undefined &&
    !allowedPaymentTypes.includes(body.payment_type)
  ) {
    errors.push(
      "payment_type must be one of cash, card, bank_transfer, qr, or credit"
    );
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("items must be a non-empty array");
    return errors;
  }

  body.items.forEach((item, index) => {
    if (!isPositiveInteger(item.product_id)) {
      errors.push(`items[${index}].product_id must be a positive integer`);
    }

    if (!isPositiveInteger(item.quantity)) {
      errors.push(`items[${index}].quantity must be a positive integer`);
    }
  });

  return errors;
};

const formatSale = (sale) => ({
  ...sale,
  total_amount: Number(sale.total_amount),
  total_profit: Number(sale.total_profit),
});

const formatSaleItem = (item) => ({
  ...item,
  buying_price: Number(item.buying_price),
  selling_price: Number(item.selling_price),
  subtotal: Number(item.subtotal),
  profit: Number(item.profit),
});

exports.createSale = async (req, res) => {
  const errors = validateSaleRequest(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  const connection = db.promise();
  const shopId = req.user.shop_id;
  const userId = req.user.id;
  const paymentType = req.body.payment_type || "cash";
  const items = req.body.items.map((item) => ({
    product_id: Number(item.product_id),
    quantity: Number(item.quantity),
  }));

  const quantityByProduct = items.reduce((totals, item) => {
    totals[item.product_id] = (totals[item.product_id] || 0) + item.quantity;
    return totals;
  }, {});
  const productIds = Object.keys(quantityByProduct).map(Number);

  try {
    await connection.beginTransaction();

    const [products] = await connection.query(
      "SELECT id, product_name, buying_price, selling_price, stock_quantity FROM products WHERE shop_id = ? AND id IN (?) FOR UPDATE",
      [shopId, productIds]
    );

    if (products.length !== productIds.length) {
      await connection.rollback();
      return res.status(404).json({
        message: "One or more products were not found in your shop",
      });
    }

    const productMap = products.reduce((map, product) => {
      map[product.id] = product;
      return map;
    }, {});

    for (const productId of productIds) {
      const product = productMap[productId];
      const requestedQuantity = quantityByProduct[productId];

      if (product.stock_quantity < requestedQuantity) {
        await connection.rollback();
        return res.status(400).json({
          message: `Not enough stock for ${product.product_name}`,
          product_id: product.id,
          available_stock: product.stock_quantity,
          requested_quantity: requestedQuantity,
        });
      }
    }

    const saleItems = items.map((item) => {
      const product = productMap[item.product_id];
      const buyingPrice = toNumber(product.buying_price);
      const sellingPrice = toNumber(product.selling_price);
      const subtotal = formatMoney(sellingPrice * item.quantity);
      const profit = formatMoney((sellingPrice - buyingPrice) * item.quantity);

      return {
        product_id: item.product_id,
        quantity: item.quantity,
        buying_price: buyingPrice,
        selling_price: sellingPrice,
        subtotal,
        profit,
      };
    });

    const totalAmount = formatMoney(
      saleItems.reduce((sum, item) => sum + item.subtotal, 0)
    );
    const totalProfit = formatMoney(
      saleItems.reduce((sum, item) => sum + item.profit, 0)
    );

    const [saleResult] = await connection.query(
      "INSERT INTO sales (shop_id, user_id, total_amount, total_profit, payment_type) VALUES (?, ?, ?, ?, ?)",
      [shopId, userId, totalAmount, totalProfit, paymentType]
    );

    const saleId = saleResult.insertId;
    const saleItemRows = saleItems.map((item) => [
      saleId,
      item.product_id,
      item.quantity,
      item.buying_price,
      item.selling_price,
      item.subtotal,
      item.profit,
    ]);

    await connection.query(
      `INSERT INTO sale_items
       (sale_id, product_id, quantity, buying_price, selling_price, subtotal, profit)
       VALUES ?`,
      [saleItemRows]
    );

    for (const productId of productIds) {
      await connection.query(
        "UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND shop_id = ?",
        [quantityByProduct[productId], productId, shopId]
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: "Sale created successfully",
      sale: {
        id: saleId,
        shop_id: shopId,
        user_id: userId,
        total_amount: totalAmount,
        total_profit: totalProfit,
        payment_type: paymentType,
        items: saleItems,
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Sale rollback failed:", rollbackError.message);
    }

    console.error("Create sale error:", error.message);
    return res.status(500).json({ message: "Server error while creating sale" });
  }
};

exports.getSales = async (req, res) => {
  try {
    const [sales] = await db.promise().query(
      `SELECT sales.id, sales.shop_id, sales.user_id, users.name AS user_name,
              sales.total_amount, sales.total_profit, sales.payment_type,
              sales.created_at
       FROM sales
       LEFT JOIN users ON users.id = sales.user_id
       WHERE sales.shop_id = ?
       ORDER BY sales.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Sales fetched successfully",
      sales: sales.map(formatSale),
    });
  } catch (error) {
    console.error("Get sales error:", error.message);
    return res.status(500).json({ message: "Server error while fetching sales" });
  }
};

exports.getSaleById = async (req, res) => {
  const saleId = req.params.id;

  if (!isPositiveInteger(saleId)) {
    return res.status(400).json({ message: "Valid sale id is required" });
  }

  try {
    const [sales] = await db.promise().query(
      `SELECT sales.id, sales.shop_id, sales.user_id, users.name AS user_name,
              sales.total_amount, sales.total_profit, sales.payment_type,
              sales.created_at
       FROM sales
       LEFT JOIN users ON users.id = sales.user_id
       WHERE sales.id = ? AND sales.shop_id = ?
       LIMIT 1`,
      [saleId, req.user.shop_id]
    );

    if (sales.length === 0) {
      return res.status(404).json({ message: "Sale not found" });
    }

    const [items] = await db.promise().query(
      `SELECT sale_items.id, sale_items.sale_id, sale_items.product_id,
              products.product_name, sale_items.quantity,
              sale_items.buying_price, sale_items.selling_price,
              sale_items.subtotal, sale_items.profit
       FROM sale_items
       LEFT JOIN products ON products.id = sale_items.product_id
       WHERE sale_items.sale_id = ?
       ORDER BY sale_items.id ASC`,
      [saleId]
    );

    return res.json({
      message: "Sale fetched successfully",
      sale: {
        ...formatSale(sales[0]),
        items: items.map(formatSaleItem),
      },
    });
  } catch (error) {
    console.error("Get sale error:", error.message);
    return res.status(500).json({ message: "Server error while fetching sale" });
  }
};
