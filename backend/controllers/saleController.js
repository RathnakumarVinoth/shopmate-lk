const db = require("../config/db");
const {
  ensurePaymentVerificationTable,
  ensureSalesPaymentColumns,
} = require("../utils/paymentSchema");
const { ensureProductCatalogSchema } = require("../utils/productCatalogSchema");
const { ensureSaasSchema } = require("../utils/saasSchema");
const { ensureShopSettingsColumns } = require("../utils/shopSchema");
const { createAuditLogFromRequest } = require("../utils/auditLog");

const allowedPaymentTypes = ["cash", "card", "bank_transfer", "qr", "credit"];
const paidRequiredTypes = ["cash", "card", "bank_transfer", "qr"];
const verifiablePaymentTypes = ["card", "bank_transfer", "qr"];
const allowedDiscountTypes = ["fixed", "percentage"];

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

    if (
      item.item_discount !== undefined &&
      !isNonNegativeNumber(item.item_discount)
    ) {
      errors.push(`items[${index}].item_discount must be a non-negative number`);
    }

    if (
      item.item_discount_type !== undefined &&
      !allowedDiscountTypes.includes(item.item_discount_type)
    ) {
      errors.push(`items[${index}].item_discount_type must be fixed or percentage`);
    }

    if (
      item.tax_percentage !== undefined &&
      !isNonNegativeNumber(item.tax_percentage)
    ) {
      errors.push(`items[${index}].tax_percentage must be a non-negative number`);
    }
  });

  if (
    body.discount_amount !== undefined &&
    !isNonNegativeNumber(body.discount_amount)
  ) {
    errors.push("discount_amount must be a non-negative number");
  }

  if (
    body.bill_discount !== undefined &&
    !isNonNegativeNumber(body.bill_discount)
  ) {
    errors.push("bill_discount must be a non-negative number");
  }

  if (
    body.tax_percentage !== undefined &&
    !isNonNegativeNumber(body.tax_percentage)
  ) {
    errors.push("tax_percentage must be a non-negative number");
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

  if (paymentType === "card" && !/^\d{4}$/.test(String(body.card_last_four || "").trim())) {
    errors.push("card_last_four is required for card payments and must contain exactly 4 digits");
  }

  if (
    ["bank_transfer", "qr"].includes(paymentType) &&
    !optionalText(body.payment_reference)
  ) {
    errors.push("payment_reference is required for bank transfer and QR payments");
  }

  return errors;
};

const formatSale = (sale) => ({
  ...sale,
  subtotal: Number(sale.subtotal || 0),
  item_discount_total: Number(sale.item_discount_total || 0),
  bill_discount: Number(sale.bill_discount || 0),
  total_amount: Number(sale.total_amount),
  discount_amount: Number(sale.discount_amount || 0),
  tax_percentage: Number(sale.tax_percentage || 0),
  tax_amount: Number(sale.tax_amount || 0),
  total_before_tax: Number(sale.total_before_tax || sale.total_amount || 0),
  total_profit: Number(sale.total_profit),
  paid_amount: Number(sale.paid_amount || 0),
  balance_amount: Number(sale.balance_amount || 0),
  payment_status: sale.payment_status || "verified",
});

const formatSaleItem = (item) => ({
  ...item,
  buying_price: Number(item.buying_price),
  selling_price: Number(item.selling_price),
  unit_price: Number(item.unit_price ?? item.selling_price),
  item_discount: Number(item.item_discount || 0),
  item_discount_type: item.item_discount_type || "fixed",
  tax_percentage: Number(item.tax_percentage || 0),
  tax_amount: Number(item.tax_amount || 0),
  line_total_before_tax: Number(item.line_total_before_tax || item.subtotal || 0),
  line_total: Number(item.line_total || item.subtotal || 0),
  subtotal: Number(item.subtotal || item.line_total || 0),
  profit: Number(item.profit),
});

const canViewSaleCosts = (user) =>
  user?.role === "owner" || user?.role === "admin";

const formatSaleForResponse = (sale, user) => {
  const formatted = formatSale(sale);
  if (canViewSaleCosts(user)) return formatted;

  const safeSale = { ...formatted };
  delete safeSale.total_profit;
  return safeSale;
};

const formatSaleItemForResponse = (item, user) => {
  const formatted = formatSaleItem(item);
  if (canViewSaleCosts(user)) return formatted;

  const safeItem = { ...formatted };
  delete safeItem.buying_price;
  delete safeItem.profit;
  return safeItem;
};

const buildReceipt = ({ sale, shop, customer, items }) => {
  const formattedSale = formatSale(sale);
  const receiptItems = items.map(formatSaleItem);
  const calculatedSubtotal = formatMoney(
    receiptItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  );
  const subtotal = formattedSale.subtotal || calculatedSubtotal;
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
    receipt_show_logo: Boolean(Number(shop?.receipt_show_logo ?? 1)),
    receipt_show_tax: Boolean(Number(shop?.receipt_show_tax ?? 1)),
    receipt_show_discounts: Boolean(
      Number(shop?.receipt_show_discounts ?? 1)
    ),
    receipt_show_cashier: Boolean(Number(shop?.receipt_show_cashier ?? 1)),
    items: receiptItems.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      unit: item.unit || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      selling_price: item.selling_price,
      item_discount: item.item_discount,
      item_discount_type: item.item_discount_type,
      tax_percentage: item.tax_percentage,
      tax_amount: item.tax_amount,
      line_total_before_tax: item.line_total_before_tax,
      line_total: item.line_total,
      subtotal: item.subtotal,
    })),
    subtotal,
    total_before_discount: subtotal,
    item_discount_total: formattedSale.item_discount_total,
    bill_discount: formattedSale.bill_discount,
    discount_amount: formattedSale.discount_amount,
    tax_percentage: formattedSale.tax_percentage,
    tax_amount: formattedSale.tax_amount,
    total_before_tax: formattedSale.total_before_tax,
    final_total: formattedSale.total_amount,
    paid_amount: formattedSale.paid_amount,
    balance_amount: formattedSale.balance_amount,
    payment_type: formattedSale.payment_type,
    payment_reference: formattedSale.payment_reference || null,
    approval_code: formattedSale.approval_code || null,
    card_last_four: formattedSale.card_last_four || null,
    billed_by:
      formattedSale.cashier_name ||
      formattedSale.user_name ||
      formattedSale.billed_by ||
      null,
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
  const localOfflineId = optionalText(req.body.local_offline_id);
  const syncSource = optionalText(req.body.sync_source) || "online";
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
  const requestedBillDiscount = formatMoney(
    Number(req.body.bill_discount ?? req.body.discount_amount ?? 0)
  );
  const paidAmount = formatMoney(
    paymentType === "credit"
      ? Number(req.body.paid_amount || 0)
      : Number(req.body.paid_amount)
  );
  const items = req.body.items.map((item) => ({
    product_id: Number(item.product_id),
    quantity: Number(item.quantity),
    item_discount: Number(item.item_discount || 0),
    item_discount_type: item.item_discount_type || "fixed",
    tax_percentage:
      item.tax_percentage === undefined || item.tax_percentage === null || item.tax_percentage === ""
        ? null
        : Number(item.tax_percentage),
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
    await ensureProductCatalogSchema();
    await ensureSaasSchema();
    await connection.beginTransaction();

    const [shops] = await connection.query(
      `SELECT shop_name, phone, email, address, receipt_footer, currency, logo_url,
              default_receipt_size, receipt_show_logo, receipt_show_tax,
              receipt_show_discounts, receipt_show_cashier, tax_percentage
       FROM shops
       WHERE id = ?
       LIMIT 1`,
      [shopId]
    );
    const shopTaxPercentage = Number(shops[0]?.tax_percentage || 0);
    const billTaxPercentage = formatMoney(
      Number(req.body.tax_percentage ?? shopTaxPercentage)
    );

    let customer = null;
    const [cashiers] = await connection.query(
      "SELECT name FROM users WHERE id = ? AND shop_id = ? LIMIT 1",
      [userId, shopId]
    );
    const cashierName = cashiers[0]?.name || null;

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
      `SELECT id, product_name, unit, buying_price,
              COALESCE(wholesale_price, buying_price) AS wholesale_price,
              selling_price, stock_quantity
       FROM products
       WHERE shop_id = ? AND id IN (?) FOR UPDATE`,
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
      const buyingPrice = toNumber(product.wholesale_price ?? product.buying_price);
      const sellingPrice = toNumber(product.selling_price);
      const grossLineTotal = formatMoney(sellingPrice * item.quantity);
      const itemDiscountType = item.item_discount_type || "fixed";
      const itemDiscount = formatMoney(
        itemDiscountType === "percentage"
          ? (grossLineTotal * Number(item.item_discount || 0)) / 100
          : Number(item.item_discount || 0)
      );

      if (itemDiscount > grossLineTotal) {
        const error = new Error(`Item discount cannot exceed total for ${product.product_name}`);
        error.statusCode = 400;
        throw error;
      }

      const lineTotalBeforeTax = formatMoney(grossLineTotal - itemDiscount);
      const lineTaxPercentage =
        item.tax_percentage === null ? billTaxPercentage : formatMoney(item.tax_percentage);

      return {
        product_id: item.product_id,
        product_name: product.product_name,
        unit: product.unit || null,
        quantity: item.quantity,
        buying_price: buyingPrice,
        unit_price: sellingPrice,
        selling_price: sellingPrice,
        gross_line_total: grossLineTotal,
        item_discount: itemDiscount,
        item_discount_type: itemDiscountType,
        tax_percentage: lineTaxPercentage,
        line_total_before_tax: lineTotalBeforeTax,
        tax_amount: 0,
        line_total: lineTotalBeforeTax,
        subtotal: lineTotalBeforeTax,
        profit: formatMoney(lineTotalBeforeTax - buyingPrice * item.quantity),
      };
    });

    const subtotal = formatMoney(
      saleItems.reduce((sum, item) => sum + item.gross_line_total, 0)
    );
    const itemDiscountTotal = formatMoney(
      saleItems.reduce((sum, item) => sum + item.item_discount, 0)
    );
    const afterItemDiscountTotal = formatMoney(subtotal - itemDiscountTotal);

    if (requestedBillDiscount > afterItemDiscountTotal) {
      await connection.rollback();
      return res.status(400).json({
        message: "bill_discount cannot be greater than total after item discounts",
        items_total: afterItemDiscountTotal,
      });
    }

    const totalBeforeTax = formatMoney(afterItemDiscountTotal - requestedBillDiscount);
    const taxAmount = formatMoney((totalBeforeTax * billTaxPercentage) / 100);
    const totalAmount = formatMoney(totalBeforeTax + taxAmount);
    const discountAmount = formatMoney(itemDiscountTotal + requestedBillDiscount);
    const totalProfit = formatMoney(
      saleItems.reduce((sum, item) => sum + item.profit, 0) - requestedBillDiscount
    );

    if (totalAmount < 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Final total cannot be below 0" });
    }

    const taxableLineTotal = saleItems.reduce(
      (sum, item) => sum + item.line_total_before_tax,
      0
    );
    let allocatedTaxTotal = 0;
    const finalSaleItems = saleItems.map((item, index) => {
      const isLast = index === saleItems.length - 1;
      const share =
        taxableLineTotal === 0 ? 0 : item.line_total_before_tax / taxableLineTotal;
      const lineTax = isLast
        ? formatMoney(taxAmount - allocatedTaxTotal)
        : formatMoney(taxAmount * share);

      allocatedTaxTotal = formatMoney(allocatedTaxTotal + lineTax);

      return {
        ...item,
        tax_percentage: billTaxPercentage,
        tax_amount: lineTax,
        line_total: formatMoney(item.line_total_before_tax + lineTax),
        subtotal: formatMoney(item.line_total_before_tax + lineTax),
      };
    });

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
       (shop_id, user_id, created_by, customer_id, subtotal, item_discount_total,
        bill_discount, discount_amount, tax_percentage, tax_amount,
        total_before_tax, total_amount, total_profit, payment_type,
        paid_amount, balance_amount, payment_status, payment_reference,
        approval_code, card_last_four, cashier_name, local_offline_id,
        sync_source, verified_by, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${
         paymentStatus === "verified" ? "NOW()" : "NULL"
       })`,
      [
        shopId,
        userId,
        userId,
        customerId,
        subtotal,
        itemDiscountTotal,
        requestedBillDiscount,
        discountAmount,
        billTaxPercentage,
        taxAmount,
        totalBeforeTax,
        totalAmount,
        totalProfit,
        paymentType,
        paidAmount,
        balanceAmount,
        paymentStatus,
        paymentReference,
        approvalCode,
        cardLastFour,
        cashierName,
        localOfflineId,
        syncSource,
        verifiedBy,
      ]
    );

    const saleId = saleResult.insertId;
    const invoiceNo = generateInvoiceNo(saleId);

    await connection.query("UPDATE sales SET invoice_no = ? WHERE id = ? AND shop_id = ?", [
      invoiceNo,
      saleId,
      shopId,
    ]);

    if (requiresVerification) {
      await connection.query(
        `INSERT INTO payment_verifications
         (sale_id, shop_id, payment_method, amount, reference_no, approval_code,
          card_last_four, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          saleId,
          shopId,
          paymentType,
          totalAmount,
          paymentReference,
          approvalCode,
          cardLastFour,
        ]
      );
    }

    const saleItemRows = finalSaleItems.map((item) => [
      saleId,
      item.product_id,
      item.quantity,
      item.buying_price,
      item.selling_price,
      item.unit_price,
      item.item_discount,
      item.item_discount_type,
      item.tax_percentage,
      item.tax_amount,
      item.line_total_before_tax,
      item.line_total,
      item.subtotal,
      item.profit,
    ]);

    await connection.query(
      `INSERT INTO sale_items
       (sale_id, product_id, quantity, buying_price, selling_price,
        unit_price, item_discount, item_discount_type, tax_percentage,
        tax_amount, line_total_before_tax, line_total, subtotal, profit)
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
      `SELECT sales.*, users.name AS user_name,
              customers.customer_name, customers.phone AS customer_phone,
              customers.address AS customer_address
       FROM sales
       LEFT JOIN users
         ON users.id = sales.user_id
        AND users.shop_id = sales.shop_id
       LEFT JOIN customers
         ON customers.id = sales.customer_id
        AND customers.shop_id = sales.shop_id
       WHERE sales.id = ? AND sales.shop_id = ?
       LIMIT 1`,
      [saleId, shopId]
    );

    await connection.commit();

    const receipt = buildReceipt({
      sale: sales[0],
      shop: shops[0],
      customer: customer || sales[0],
      items: finalSaleItems,
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
        ...formatSaleForResponse(sales[0], req.user),
        subtotal,
        item_discount_total: itemDiscountTotal,
        bill_discount: requestedBillDiscount,
        discount_amount: discountAmount,
        tax_percentage: billTaxPercentage,
        tax_amount: taxAmount,
        total_before_tax: totalBeforeTax,
        items_total: subtotal,
        items: finalSaleItems.map((item) =>
          formatSaleItemForResponse(item, req.user)
        ),
        credit_record_id: creditRecordId,
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Sale rollback failed:", rollbackError.message);
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Create sale error:", error.message);
    return res.status(500).json({ message: "Server error while creating sale" });
  }
};

exports.getSales = async (req, res) => {
  try {
    await ensureSalesPaymentColumns();
    await ensureSaasSchema();
    await ensureShopSettingsColumns();
    await ensureProductCatalogSchema();

    const [sales] = await db.promise().query(
      `SELECT sales.id, sales.invoice_no, sales.shop_id, sales.user_id,
              users.name AS user_name, sales.cashier_name, sales.subtotal, sales.item_discount_total,
              sales.bill_discount, sales.discount_amount, sales.tax_percentage,
              sales.tax_amount, sales.total_before_tax, sales.total_amount,
              sales.total_profit, sales.payment_type,
              sales.paid_amount, sales.balance_amount, sales.customer_id,
              sales.payment_status, sales.payment_reference, sales.approval_code,
              sales.card_last_four, sales.verified_by, sales.verified_at,
              customers.customer_name, customers.phone AS customer_phone,
              sales.created_at
       FROM sales
       LEFT JOIN users
         ON users.id = sales.user_id
        AND users.shop_id = sales.shop_id
       LEFT JOIN customers
         ON customers.id = sales.customer_id
        AND customers.shop_id = sales.shop_id
       WHERE sales.shop_id = ?
       ORDER BY sales.id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Sales fetched successfully",
      sales: sales.map((sale) => formatSaleForResponse(sale, req.user)),
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
    await ensureSaasSchema();
    await ensureProductCatalogSchema();

    const [sales] = await db.promise().query(
      `SELECT sales.*, users.name AS user_name,
              shops.shop_name, shops.phone, shops.email, shops.address,
              shops.receipt_footer, shops.currency, shops.logo_url,
              shops.default_receipt_size,
              shops.receipt_show_logo, shops.receipt_show_tax,
              shops.receipt_show_discounts, shops.receipt_show_cashier,
              sales.cashier_name,
              customers.customer_name, customers.phone AS customer_phone,
              customers.address AS customer_address
       FROM sales
       LEFT JOIN users
         ON users.id = sales.user_id
        AND users.shop_id = sales.shop_id
       LEFT JOIN shops ON shops.id = sales.shop_id
       LEFT JOIN customers
         ON customers.id = sales.customer_id
        AND customers.shop_id = sales.shop_id
       WHERE sales.id = ? AND sales.shop_id = ?
       LIMIT 1`,
      [saleId, req.user.shop_id]
    );

    if (sales.length === 0) {
      return res.status(404).json({ message: "Sale not found" });
    }

    const [items] = await db.promise().query(
      `SELECT sale_items.id, sale_items.sale_id, sale_items.product_id,
              products.product_name, products.unit, sale_items.quantity,
              sale_items.buying_price, sale_items.selling_price,
              sale_items.unit_price, sale_items.item_discount,
              sale_items.item_discount_type, sale_items.tax_percentage,
              sale_items.tax_amount, sale_items.line_total_before_tax,
              sale_items.line_total, sale_items.subtotal, sale_items.profit
       FROM sale_items
       INNER JOIN sales
         ON sales.id = sale_items.sale_id
        AND sales.shop_id = ?
       LEFT JOIN products
         ON products.id = sale_items.product_id
        AND products.shop_id = sales.shop_id
       WHERE sale_items.sale_id = ?
       ORDER BY sale_items.id ASC`,
      [req.user.shop_id, saleId]
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
        ...formatSaleForResponse(sales[0], req.user),
        items_total: receipt.total_before_discount,
        items: items.map((item) => formatSaleItemForResponse(item, req.user)),
      },
    });
  } catch (error) {
    console.error("Get sale error:", error.message);
    return res.status(500).json({ message: "Server error while fetching sale" });
  }
};

const runSaleCreateForSync = async (req, saleBody) => {
  const captured = {
    statusCode: 200,
    payload: null,
  };
  const mockRes = {
    status(code) {
      captured.statusCode = code;
      return this;
    },
    json(payload) {
      captured.payload = payload;
      return this;
    },
  };

  await exports.createSale(
    {
      ...req,
      body: saleBody,
    },
    mockRes
  );

  return captured;
};

const normalizeOfflineSalePayload = (sale) => ({
  local_offline_id: optionalText(sale.local_offline_id),
  sync_source: "offline_lite",
  customer_id: sale.customer_id || null,
  payment_type: "cash",
  bill_discount: Number(sale.bill_discount ?? sale.discount_amount ?? 0),
  discount_amount: Number(sale.bill_discount ?? sale.discount_amount ?? 0),
  tax_percentage: Number(sale.tax_percentage || 0),
  paid_amount: Number(sale.paid_amount || sale.total_amount || 0),
  items: (sale.items || sale.cart_items || []).map((item) => ({
    product_id: Number(item.product_id || item.id),
    quantity: Number(item.quantity),
    item_discount: Number(item.item_discount || 0),
    item_discount_type: item.item_discount_type || "fixed",
  })),
});

exports.syncOfflineSales = async (req, res) => {
  const sales = Array.isArray(req.body.sales)
    ? req.body.sales
    : req.body.sale
    ? [req.body.sale]
    : Array.isArray(req.body)
    ? req.body
    : [];

  if (sales.length === 0) {
    return res.status(400).json({ message: "sales must be a non-empty array" });
  }

  try {
    await ensureSaasSchema();
    await ensureSalesPaymentColumns();

    const results = [];

    for (const sale of sales) {
      const localOfflineId = optionalText(sale.local_offline_id);

      if (!localOfflineId) {
        results.push({
          local_offline_id: null,
          sync_status: "failed",
          message: "local_offline_id is required",
        });
        continue;
      }

      if (sale.shop_id && Number(sale.shop_id) !== Number(req.user.shop_id)) {
        results.push({
          local_offline_id: localOfflineId,
          sync_status: "failed",
          message: "Offline sale does not belong to this shop",
        });
        continue;
      }

      if ((sale.payment_method || sale.payment_type || "cash") !== "cash") {
        results.push({
          local_offline_id: localOfflineId,
          sync_status: "failed",
          message: "Only cash offline sales can be synced",
        });
        continue;
      }

      const [existingSales] = await db.promise().query(
        `SELECT id, invoice_no
         FROM sales
         WHERE shop_id = ? AND local_offline_id = ?
         LIMIT 1`,
        [req.user.shop_id, localOfflineId]
      );

      if (existingSales.length > 0) {
        results.push({
          local_offline_id: localOfflineId,
          real_sale_id: existingSales[0].id,
          real_invoice_no: existingSales[0].invoice_no,
          sync_status: "synced",
          duplicate: true,
        });
        continue;
      }

      const createResult = await runSaleCreateForSync(
        req,
        normalizeOfflineSalePayload(sale)
      );

      if (createResult.statusCode >= 400) {
        const syncMessage = createResult.payload?.message || "Sync failed";
        const stockMatch = syncMessage.match(/^Not enough stock for (.+)$/i);
        results.push({
          local_offline_id: localOfflineId,
          sync_status: "failed",
          message: stockMatch
            ? `Sync failed: insufficient stock for ${stockMatch[1]}`
            : syncMessage,
          errors: createResult.payload?.errors || undefined,
        });
        continue;
      }

      const saleId = createResult.payload?.sale?.id || createResult.payload?.receipt?.sale_id;
      const invoiceNo =
        createResult.payload?.receipt?.invoice_no ||
        createResult.payload?.sale?.invoice_no ||
        null;

      try {
        await db.promise().query(
          `UPDATE sales
           SET local_offline_id = ?, sync_source = 'offline_lite', created_by = ?
           WHERE id = ? AND shop_id = ?`,
          [localOfflineId, req.user.id, saleId, req.user.shop_id]
        );
      } catch (error) {
        if (error.code !== "ER_DUP_ENTRY") {
          throw error;
        }

        const [duplicateSales] = await db.promise().query(
          `SELECT id, invoice_no
           FROM sales
           WHERE shop_id = ? AND local_offline_id = ?
           LIMIT 1`,
          [req.user.shop_id, localOfflineId]
        );

        results.push({
          local_offline_id: localOfflineId,
          real_sale_id: duplicateSales[0]?.id || null,
          real_invoice_no: duplicateSales[0]?.invoice_no || null,
          sync_status: "synced",
          duplicate: true,
        });
        continue;
      }

      await createAuditLogFromRequest(req, {
        action: "offline_sale_sync",
        entity_type: "sale",
        entity_id: saleId,
        description: `Synced offline sale ${sale.temporary_invoice_no || localOfflineId}`,
      });

      results.push({
        local_offline_id: localOfflineId,
        real_sale_id: saleId,
        real_invoice_no: invoiceNo,
        sync_status: "synced",
      });
    }

    return res.json({
      message: "Offline sales sync completed",
      results,
    });
  } catch (error) {
    console.error("Sync offline sales error:", error.message);
    return res.status(500).json({ message: "Server error while syncing offline sales" });
  }
};
