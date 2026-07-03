const db = require("../config/db");

let ensuredSalesColumns = false;
let ensuredPaymentVerifications = false;

const paymentColumns = [
  {
    name: "discount_amount",
    definition:
      "ALTER TABLE sales ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "paid_amount",
    definition:
      "ALTER TABLE sales ADD COLUMN paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "balance_amount",
    definition:
      "ALTER TABLE sales ADD COLUMN balance_amount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "subtotal",
    definition:
      "ALTER TABLE sales ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "item_discount_total",
    definition:
      "ALTER TABLE sales ADD COLUMN item_discount_total DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "bill_discount",
    definition:
      "ALTER TABLE sales ADD COLUMN bill_discount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "payment_status",
    definition:
      "ALTER TABLE sales ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'verified'",
  },
  {
    name: "tax_percentage",
    definition:
      "ALTER TABLE sales ADD COLUMN tax_percentage DECIMAL(5,2) NOT NULL DEFAULT 0",
  },
  {
    name: "tax_amount",
    definition:
      "ALTER TABLE sales ADD COLUMN tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "total_before_tax",
    definition:
      "ALTER TABLE sales ADD COLUMN total_before_tax DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "payment_reference",
    definition: "ALTER TABLE sales ADD COLUMN payment_reference VARCHAR(100) NULL",
  },
  {
    name: "approval_code",
    definition: "ALTER TABLE sales ADD COLUMN approval_code VARCHAR(50) NULL",
  },
  {
    name: "card_last_four",
    definition: "ALTER TABLE sales ADD COLUMN card_last_four VARCHAR(4) NULL",
  },
  {
    name: "verified_by",
    definition: "ALTER TABLE sales ADD COLUMN verified_by INT NULL",
  },
  {
    name: "verified_at",
    definition: "ALTER TABLE sales ADD COLUMN verified_at DATETIME NULL",
  },
];

const saleItemColumns = [
  {
    name: "unit_price",
    definition:
      "ALTER TABLE sale_items ADD COLUMN unit_price DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "item_discount",
    definition:
      "ALTER TABLE sale_items ADD COLUMN item_discount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "item_discount_type",
    definition:
      "ALTER TABLE sale_items ADD COLUMN item_discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed'",
  },
  {
    name: "tax_percentage",
    definition:
      "ALTER TABLE sale_items ADD COLUMN tax_percentage DECIMAL(5,2) NOT NULL DEFAULT 0",
  },
  {
    name: "tax_amount",
    definition:
      "ALTER TABLE sale_items ADD COLUMN tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "line_total_before_tax",
    definition:
      "ALTER TABLE sale_items ADD COLUMN line_total_before_tax DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "line_total",
    definition:
      "ALTER TABLE sale_items ADD COLUMN line_total DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
];

const paymentVerificationColumns = [
  {
    name: "sale_id",
    definition: "ALTER TABLE payment_verifications ADD COLUMN sale_id INT NULL",
  },
  {
    name: "shop_id",
    definition: "ALTER TABLE payment_verifications ADD COLUMN shop_id INT NULL",
  },
  {
    name: "payment_method",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN payment_method VARCHAR(50) NULL",
  },
  {
    name: "amount",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN amount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "reference_no",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN reference_no VARCHAR(100) NULL",
  },
  {
    name: "status",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'",
  },
  {
    name: "verified_by",
    definition: "ALTER TABLE payment_verifications ADD COLUMN verified_by INT NULL",
  },
  {
    name: "verified_at",
    definition: "ALTER TABLE payment_verifications ADD COLUMN verified_at DATETIME NULL",
  },
  {
    name: "failed_at",
    definition: "ALTER TABLE payment_verifications ADD COLUMN failed_at DATETIME NULL",
  },
  {
    name: "created_at",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  },
  {
    name: "updated_at",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  },
];

const ensureSalesPaymentColumns = async () => {
  if (ensuredSalesColumns) return;

  const connection = db.promise();
  const [salesColumns] = await connection.query("SHOW COLUMNS FROM sales");
  const existingSalesColumns = new Set(salesColumns.map((column) => column.Field));

  for (const column of paymentColumns) {
    if (!existingSalesColumns.has(column.name)) {
      await connection.query(column.definition);
    }
  }

  const [saleItemTableRows] = await connection.query("SHOW TABLES LIKE 'sale_items'");

  if (saleItemTableRows.length > 0) {
    const [saleItemColumnsResult] = await connection.query("SHOW COLUMNS FROM sale_items");
    const existingSaleItemColumns = new Set(
      saleItemColumnsResult.map((column) => column.Field)
    );

    for (const column of saleItemColumns) {
      if (!existingSaleItemColumns.has(column.name)) {
        await connection.query(column.definition);
      }
    }

    await connection.query(`
      UPDATE sale_items
      SET unit_price = CASE WHEN unit_price = 0 THEN selling_price ELSE unit_price END,
          line_total_before_tax = CASE
            WHEN line_total_before_tax = 0 THEN subtotal
            ELSE line_total_before_tax
          END,
          line_total = CASE WHEN line_total = 0 THEN subtotal ELSE line_total END
    `);
  }

  await connection.query(`
    UPDATE sales
    SET subtotal = CASE
          WHEN subtotal = 0 THEN total_amount + COALESCE(discount_amount, 0)
          ELSE subtotal
        END,
        bill_discount = CASE
          WHEN bill_discount = 0 THEN COALESCE(discount_amount, 0)
          ELSE bill_discount
        END,
        total_before_tax = CASE
          WHEN total_before_tax = 0 THEN total_amount
          ELSE total_before_tax
        END
  `);

  ensuredSalesColumns = true;
};

const ensurePaymentVerificationTable = async () => {
  if (ensuredPaymentVerifications) return;

  const connection = db.promise();

  await connection.query(`
    CREATE TABLE IF NOT EXISTS payment_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      shop_id INT NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      reference_no VARCHAR(100) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      verified_by INT NULL,
      verified_at DATETIME NULL,
      failed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_payment_verification_sale (sale_id),
      INDEX idx_payment_verifications_shop_status (shop_id, status)
    )
  `);

  const [columns] = await connection.query("SHOW COLUMNS FROM payment_verifications");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const column of paymentVerificationColumns) {
    if (!existingColumns.has(column.name)) {
      await connection.query(column.definition);
    }
  }

  ensuredPaymentVerifications = true;
};

module.exports = { ensurePaymentVerificationTable, ensureSalesPaymentColumns };
