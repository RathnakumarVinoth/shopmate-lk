const db = require("../config/db");
const {
  ensurePaymentVerificationTable,
  ensureSalesPaymentColumns,
} = require("../utils/paymentSchema");
const { ensureShopSettingsColumns } = require("../utils/shopSchema");
const { createAuditLogFromRequest } = require("../utils/auditLog");

const allowedPaymentTypes = ["cash", "card", "bank_transfer", "qr", "credit"];
const paidRequiredTypes = ["cash", "card", "bank_transfer", "qr"];
const verifiablePaymentTypes = ["card", "bank_transfer", "qr"];

const toNumber = (value) => Number(value);

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const isNonNegativeNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) >= 0;

const formatMoney = (value) => Number(Number(value).toFixed(2));

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const getPaymentStatus = (paymentType) => {
  if (paymentType === "cash") return "verified";
  if (paymentType === "credit") return "credit";
  if (verifiablePaymentTypes.includes(paymentType)) return "pending";

  return "pending";
};

const formatDatePart = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
};

const generateInvoiceNo = (saleId, date = new Date()) =>
  `INV-${formatDatePart(new Date(date))}-${String(saleId).padStart(4, "0")}`;

const validateSaleRequest = (body) => {
  const errors = [];
  const paymentType = body.payment_type || "cash";

  if (!allowedPaymentTypes.includes(paymentType)) {
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
      errors.push(`items[${index}].quantity must be greater than 0`);
    }
  });

  if (
    body.discount_amount !== undefined &&
    !isNonNegativeNumber(body.discount_amount)
  ) {
    errors.push("discount_amount must be a non-negative number");
  }

  if (paidRequiredTypes.includes(paymentType) && body.paid_amount === undefined) {
    errors.push(`paid_amount is required for ${paymentType} payments`);
  }

  if (
    body.paid_amount !== undefined &&
    !isNonNegativeNumber(body.paid_amount)
  ) {
    errors.push("paid_amount must be a non-negative number");
  }

  if (
    body.customer_id !== undefined &&
    body.customer_id !== null &&
    body.customer_id !== "" &&
    !isPositiveInteger(body.customer_id)
  ) {
    errors.push("customer_id must be a positive integer");
  }

  if (paymentType === "credit" && !isPositiveInteger(body.customer_id)) {
    errors.push("customer_id is required for credit sales");
  }

  if (
    body.card_last_four !== undefined &&
    body.card_last_four !== null &&
    body.card_last_four !== "" &&
    !/^\d{4}$/.test(String(body.card_last_four).trim())
  ) {
    errors.push("card_last_four must contain exactly 4 digits");
  }

  return errors;
};

const formatSale = (sale) => ({
  ...sale,
  total_amount: Number(sale.total_amount),
  discount_amount: Number(sale.discount_amount || 0),
  total_profit: Number(sale.total_profit),
  paid_amount: Number(sale.paid_amount || 0),
  balance_amount: Number(sale.balance_amount || 0),
  payment_status: sale.payment_status || "verified",
});

const formatSaleItem = (item) => ({
  ...item,
  buying_price: Number(item.buying_price),
  selling_price: Number(item.selling_price),
  subtotal: Number(item.subtotal),
  profit: Number(item.profit),
});

const buildReceipt = ({ sale, shop, customer, items }) => {
  const formattedSale = formatSale(sale);
  const receiptItems = items.map(formatSaleItem);
  const itemsTotal = formatMoney(
    receiptItems.reduce((sum, item) => sum + item.subtotal, 0)
  );
  const receiptCustomer = customer || {};

  return {
    invoice_no:
      formattedSale.invoice_no ||
      generateInvoiceNo(formattedSale.id, formattedSale.created_at),
    sale_id: formattedSale.id,
    customer_id: formattedSale.customer_id || receiptCustomer.id || null,
    customer_name: receiptCustomer.customer_name || sale.customer_name || null,
    customer_phone:
      receiptCustomer.phone || receiptCustomer.customer_phone || sale.customer_phone || null,
    customer_address:
      receiptCustomer.address ||
      receiptCustomer.customer_address ||
      sale.customer_address ||
      null,
    shop_name: shop?.shop_name || "ShopMate LK",
    shop_phone: shop?.phone || null,
    shop_email: shop?.email || null,
    shop_address: shop?.address || null,
    receipt_footer: shop?.receipt_footer || "Thank you for shopping with us.",
    currency: shop?.currency || "LKR",
    logo_url: shop?.logo_url || null,
    default_receipt_size: shop?.default_receipt_size || "80mm",
    items: receiptItems.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      selling_price: item.selling_price,
      subtotal: item.subtotal,
    })),
    total_before_discount: itemsTotal,
    discount_amount: formattedSale.discount_amount,
    final_total: formattedSale.total_amount,
    paid_amount: formattedSale.paid_amount,
    balance_amount: formattedSale.balance_amount,
    payment_type: formattedSale.payment_type,
    payment_status: formattedSale.payment_status,
    payment_reference: formattedSale.payment_reference || null,
    approval_code: formattedSale.approval_code || null,
    card_last_four: formattedSale.card_last_four || null,
    created_at: formattedSale.created_at,
  };
};

exports.createSale = async (req, res) => {
  const errors = validateSaleRequest(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  const connection = db.promise();
  const shopId = req.user.shop_id;
  const userId = req.user.id;
  const paymentType = req.body.payment_type || "cash";
  const requiresVerification = verifiablePaymentTypes.includes(paymentType);
  const paymentStatus = getPaymentStatus(paymentType);
  const paymentReference = optionalText(req.body.payment_reference);
  const approvalCode = optionalText(req.body.approval_code);
  const cardLastFour = optionalText(req.body.card_last_four);
  const verifiedBy = paymentStatus === "verified" ? userId : null;
  const customerId =
    req.body.customer_id === undefined || req.body.customer_id === null || req.body.customer_id === ""
      ? null
      : Number(req.body.customer_id);
  const discountAmount = formatMoney(Number(req.body.discount_amount || 0));
  const paidAmount = formatMoney(
    paymentType === "credit"
      ? Number(req.body.paid_amount || 0)
      : Number(req.body.paid_amount)
  );
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
    await ensureSalesPaymentColumns();
    await ensurePaymentVerificationTable();
    await ensureShopSettingsColumns();
    await connection.beginTransaction();

    const [shops] = await connection.query(
      `SELECT shop_name, phone, email, address, receipt_footer, currency, logo_url,
              default_receipt_size
       FROM shops
       WHERE id = ?
       LIMIT 1`,
      [shopId]
    );

    let customer = null;

    if (customerId) {
      const [customers] = await connection.query(
        `SELECT id, customer_name, phone, address
         FROM customers
         WHERE id = ? AND shop_id = ?
         LIMIT 1`,
        [customerId, shopId]
      );

      if (customers.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Customer not found" });
      }

      customer = customers[0];
    }

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
        product_name: product.product_name,
        quantity: item.quantity,
        buying_price: buyingPrice,
        selling_price: sellingPrice,
        subtotal,
        profit,
      };
    });

    const itemsTotal = formatMoney(
      saleItems.reduce((sum, item) => sum + item.subtotal, 0)
    );

    if (discountAmount > itemsTotal) {
      await connection.rollback();
      return res.status(400).json({
        message: "discount_amount cannot be greater than items total",
        items_total: itemsTotal,
      });
    }

    const totalAmount = formatMoney(itemsTotal - discountAmount);
    const totalProfit = formatMoney(
      saleItems.reduce((sum, item) => sum + item.profit, 0) - discountAmount
    );
    if (paymentType === "credit" && paidAmount > totalAmount) {
      await connection.rollback();
      return res.status(400).json({
        message: "paid_amount cannot be greater than total amount for credit sales",
        total_amount: totalAmount,
      });
    }

    if (paymentType !== "credit" && paidAmount < totalAmount) {
      await connection.rollback();
      return res.status(400).json({
        message: "paid_amount must be greater than or equal to total amount",
        total_amount: totalAmount,
      });
    }

    const balanceAmount =
      paymentType === "credit"
        ? formatMoney(totalAmount - paidAmount)
        : formatMoney(paidAmount - totalAmount);

    const [saleResult] = await connection.query(
      `INSERT INTO sales
       (shop_id, user_id, customer_id, total_amount, discount_amount, total_profit,
        payment_type, paid_amount, balance_amount, payment_status, payment_reference,
        approval_code, card_last_four, verified_by, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${
         paymentStatus === "verified" ? "NOW()" : "NULL"
       })`,
      [
        shopId,
        userId,
        customerId,
        totalAmount,
        discountAmount,
        totalProfit,
        paymentType,
        paidAmount,
        balanceAmount,
        paymentStatus,
        paymentReference,
        approvalCode,
        cardLastFour,
        verifiedBy,
      ]
    );

    const saleId = saleResult.insertId;
    const invoiceNo = generateInvoiceNo(saleId);

    await connection.query("UPDATE sales SET invoice_no = ? WHERE id = ?", [
      invoiceNo,
      saleId,
    ]);

    if (requiresVerification) {
      await connection.query(
        `INSERT INTO payment_verifications
         (sale_id, shop_id, payment_method, amount, reference_no, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [saleId, shopId, paymentType, totalAmount, paymentReference]
      );
    }

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

    let creditRecordId = null;

    if (paymentType === "credit") {
      let status = "unpaid";

      if (balanceAmount === 0) {
        status = "paid";
      } else if (paidAmount > 0 && balanceAmount > 0) {
        status = "partial";
      }

      const [creditResult] = await connection.query(
        `INSERT INTO credit_records
         (shop_id, customer_id, sale_id, credit_amount, paid_amount, balance_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [shopId, customerId, saleId, totalAmount, paidAmount, balanceAmount, status]
      );

      creditRecordId = creditResult.insertId;
    }

    const [sales] = await connection.query(
      `SELECT sales.*, customers.customer_name, customers.phone AS customer_phone,
              customers.address AS customer_address
       FROM sales
       LEFT JOIN customers ON customers.id = sales.customer_id
       WHERE sales.id = ? AND sales.shop_id = ?
       LIMIT 1`,
      [saleId, shopId]
    );

    await connection.commit();

    const receipt = buildReceipt({
      sale: sales[0],
      shop: shops[0],
      customer: customer || sales[0],
      items: saleItems,
    });

    await createAuditLogFromRequest(req, {
      action: "sale_create",
      entity_type: "sale",
      entity_id: saleId,
      description: `Created sale ${receipt.invoice_no} for ${receipt.final_total}`,
    });

    return res.status(201).json({
      message: "Sale created successfully",
      receipt,
      sale: {
        ...formatSale(sales[0]),
        items_total: itemsTotal,
        items: saleItems.map(formatSaleItem),
        credit_record_id: creditRecordId,
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
    await ensureSalesPaymentColumns();
    await ensureShopSettingsColumns();

    const [sales] = await db.promise().query(
      `SELECT sales.id, sales.invoice_no, sales.shop_id, sales.user_id,
              users.name AS user_name, sales.total_amount,
              sales.discount_amount, sales.total_profit, sales.payment_type,
              sales.paid_amount, sales.balance_amount, sales.customer_id,
              sales.payment_status, sales.payment_reference, sales.approval_code,
              sales.card_last_four, sales.verified_by, sales.verified_at,
              customers.customer_name, customers.phone AS customer_phone,
              sales.created_at
       FROM sales
       LEFT JOIN users ON users.id = sales.user_id
       LEFT JOIN customers ON customers.id = sales.customer_id
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
    await ensureSalesPaymentColumns();

    const [sales] = await db.promise().query(
      `SELECT sales.*, users.name AS user_name,
              shops.shop_name, shops.phone, shops.email, shops.address,
              shops.receipt_footer, shops.currency, shops.logo_url,
              shops.default_receipt_size,
              customers.customer_name, customers.phone AS customer_phone,
              customers.address AS customer_address
       FROM sales
       LEFT JOIN users ON users.id = sales.user_id
       LEFT JOIN shops ON shops.id = sales.shop_id
       LEFT JOIN customers ON customers.id = sales.customer_id
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

    const receipt = buildReceipt({
      sale: sales[0],
      shop: sales[0],
      customer: sales[0],
      items,
    });

    return res.json({
      message: "Sale fetched successfully",
      receipt,
      sale: {
        ...formatSale(sales[0]),
        items_total: receipt.total_before_discount,
        items: items.map(formatSaleItem),
      },
    });
  } catch (error) {
    console.error("Get sale error:", error.message);
    return res.status(500).json({ message: "Server error while fetching sale" });
  }
};
